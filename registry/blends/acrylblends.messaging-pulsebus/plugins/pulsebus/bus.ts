/**
 * The bus (`ctx.bus`): the saved state and every change to it. A change checks its input, builds the next state, saves it through the store and only
 * then makes it current, so a failed save leaves the bus as it was.
 */
import {
  type BusState,
  BusError,
  type ConsumerGroup,
  type Message,
  type Topic,
  attemptDelivery,
  lagOf,
  nextMessageId,
  validatePayload,
  MAX_ATTEMPTS,
} from './domain.ts'
import { seed } from './seed.ts'
import type { BusStore } from './store.ts'

export interface BusAdapters {
  readonly store: BusStore
  readonly clock: () => Date
}

export class Bus {
  #state: BusState
  readonly #adapters: BusAdapters

  private constructor(state: BusState, adapters: BusAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: BusAdapters): Promise<Bus> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Bus(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Bus(state, adapters)
  }

  get state(): BusState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  topic(id: string): Topic {
    const topic = this.#state.topics.find((t) => t.id === id)
    if (topic === undefined) throw new BusError('not-found', 'There is no such topic.')
    return topic
  }

  message(id: string): Message {
    const message = this.#state.messages.find((m) => m.id === id)
    if (message === undefined) throw new BusError('not-found', 'There is no such message.')
    return message
  }

  /** A topic's messages, newest first; the dead ones included. */
  messages(topicId: string): readonly Message[] {
    return this.#state.messages.filter((m) => m.topicId === topicId).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
  }

  deadLetters(): readonly Message[] {
    return this.#state.messages.filter((m) => m.state === 'dead').sort((a, b) => b.at.localeCompare(a.at))
  }

  lag(group: ConsumerGroup): number {
    return lagOf(group, this.#state.topics, this.#state.messages)
  }

  async #commit(next: BusState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #replace(message: Message): readonly Message[] {
    return this.#state.messages.map((m) => (m.id === message.id ? message : m))
  }

  /** Validate a synthetic event against the topic's schema and deliver it once: acknowledged, or the first retry for a poison event. */
  async publish(topicId: string, payload: string | undefined): Promise<Message> {
    const topic = this.topic(topicId)
    const data = validatePayload(topic, payload ?? '')
    const delivery = attemptDelivery({ data, attempts: 0 }, topic.groupId)
    const message: Message = {
      id: nextMessageId(this.#state.messages),
      topicId: topic.id,
      at: this.now().toISOString(),
      schemaVersion: topic.schemaVersion,
      data,
      origin: 'local',
      replays: 0,
      ...delivery,
    }
    await this.#commit({ ...this.#state, messages: [...this.#state.messages, message] })
    return message
  }

  /**
   * Replay a message: an unacknowledged one gets another delivery attempt (it is acknowledged, or fails again and dies at {@link MAX_ATTEMPTS}); an
   * acknowledged one is delivered again to the consumers and counted as a replay.
   */
  async replay(id: string): Promise<Message> {
    const message = this.message(id)
    const topic = this.topic(message.topicId)
    const { lastError: _previous, ...base } = message
    const next: Message =
      message.state === 'acked'
        ? { ...message, replays: message.replays + 1 }
        : (({ state, attempts, lastError }) => ({ ...base, state, attempts, ...(lastError === undefined ? {} : { lastError }) }))(attemptDelivery(message, topic.groupId))
    await this.#commit({ ...this.#state, messages: this.#replace(next) })
    return next
  }

  /** Remove a dead letter for good. */
  async discard(id: string): Promise<void> {
    const message = this.message(id)
    if (message.state !== 'dead') throw new BusError('conflict', `${message.id} is ${message.state}; only a dead letter can be discarded.`)
    await this.#commit({ ...this.#state, messages: this.#state.messages.filter((m) => m.id !== id) })
  }
}
