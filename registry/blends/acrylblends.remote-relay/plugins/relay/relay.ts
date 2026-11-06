/**
 * The relay (`ctx.relay`): the saved state and every change to it. A change checks its input and the guards, builds the next state, saves it through
 * the store and only then makes it current, so a failed save leaves the relay as it was.
 */
import {
  type AuditEvent,
  type ConnectionProfile,
  NEXT_STATE,
  type RelayState,
  RelayError,
  type RemoteSession,
  SAMPLE_FILES,
  type SessionStatus,
  type TerminalEntry,
  type TransferJob,
  type Workspace,
  IDLE_MINUTES,
  parseProfile,
  runCommand,
  statusOf,
} from './domain.ts'
import { seed } from './seed.ts'
import type { RelayStore } from './store.ts'

export interface RelayAdapters {
  readonly store: RelayStore
  readonly clock: () => Date
  readonly newId: (kind: 'audit' | 'transfer') => string
}

export class Relay {
  #state: RelayState
  readonly #adapters: RelayAdapters

  private constructor(state: RelayState, adapters: RelayAdapters) {
    this.#state = state
    this.#adapters = adapters
  }

  static async open(adapters: RelayAdapters): Promise<Relay> {
    const saved = await adapters.store.load()
    if (saved !== undefined) return new Relay(saved, adapters)
    const state = seed(adapters.clock())
    await adapters.store.save(state)
    return new Relay(state, adapters)
  }

  get state(): RelayState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  workspaces(): readonly Workspace[] {
    return this.#state.workspaces
  }

  profiles(workspaceId?: string): readonly ConnectionProfile[] {
    return this.#state.profiles.filter((p) => workspaceId === undefined || p.workspaceId === workspaceId)
  }

  profile(id: string): ConnectionProfile {
    const profile = this.#state.profiles.find((p) => p.id === id)
    if (profile === undefined) throw new RelayError('not-found', 'There is no such connection.')
    return profile
  }

  /** Newest first. */
  sessions(): readonly RemoteSession[] {
    return [...this.#state.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  session(id: string): RemoteSession {
    const session = this.#state.sessions.find((s) => s.id === id)
    if (session === undefined) throw new RelayError('not-found', 'There is no such session.')
    return session
  }

  status(session: RemoteSession): SessionStatus {
    return statusOf(session, this.now())
  }

  /** The profile's live session, if it has one (a timed-out session is not live). */
  activeSession(profileId: string): RemoteSession | undefined {
    return this.sessions().find((s) => s.profileId === profileId && this.status(s) === 'active')
  }

  /** The session a page shows for a profile: its live one, else its newest. */
  sessionFor(profileId: string): RemoteSession | undefined {
    return this.activeSession(profileId) ?? this.sessions().find((s) => s.profileId === profileId)
  }

  transfers(sessionId: string): readonly TransferJob[] {
    return this.#state.transfers.filter((t) => t.sessionId === sessionId)
  }

  audit(sessionId: string): readonly AuditEvent[] {
    return this.#state.audit.filter((e) => e.sessionId === sessionId)
  }

  async #commit(next: RelayState): Promise<void> {
    await this.#adapters.store.save(next)
    this.#state = next
  }

  #event(sessionId: string, text: string, result?: string): AuditEvent {
    return { id: this.#adapters.newId('audit'), sessionId, at: this.now().toISOString(), text, ...(result === undefined ? {} : { result }) }
  }

  async addProfile(fields: Readonly<Record<string, string | undefined>>): Promise<ConnectionProfile> {
    const input = parseProfile(fields, this.#state.workspaces)
    if (this.#state.profiles.some((p) => p.id === input.name)) throw new RelayError('conflict', `There is already a connection called ${input.name}.`)
    const profile: ConnectionProfile = { id: input.name, name: input.name, user: input.user, host: input.host, port: input.port, workspaceId: input.workspaceId, health: 'ok' }
    await this.#commit({ ...this.#state, profiles: [...this.#state.profiles, profile] })
    return profile
  }

  /** Open a simulated session on a profile. One live session per profile; a timed-out one is closed first. */
  async openSession(profileId: string): Promise<RemoteSession> {
    const profile = this.profile(profileId)
    const live = this.activeSession(profileId)
    if (live !== undefined) throw new RelayError('conflict', `${profile.name} already has an active session, ${live.id}. Close it first.`)
    const at = this.now().toISOString()
    const stale = this.sessions().find((s) => s.profileId === profileId && s.closedAt === undefined)
    const number = Math.max(1000, ...this.#state.sessions.map((s) => Number(s.id.slice(4)))) + 1
    const session: RemoteSession = { id: `RLY-${String(number)}`, profileId, startedAt: at, lastActivityAt: at, entries: [] }
    const events = [
      ...(stale === undefined ? [] : [this.#event(stale.id, `Session timed out after ${String(IDLE_MINUTES)} idle minutes`, 'Closed')]),
      this.#event(session.id, 'Session opened', 'OK'),
      this.#event(session.id, `Host profile ${profile.name} selected`),
    ]
    await this.#commit({
      ...this.#state,
      sessions: [...this.#state.sessions.map((s) => (stale !== undefined && s.id === stale.id ? { ...s, closedAt: s.lastActivityAt } : s)), session],
      audit: [...this.#state.audit, ...events],
    })
    return session
  }

  /** Run an allowlisted demo command in a live session. */
  async run(sessionId: string, rawCommand: string | undefined): Promise<TerminalEntry> {
    const session = this.session(sessionId)
    const command = (rawCommand ?? '').trim().replace(/\s+/g, ' ')
    if (command === '') throw new RelayError('invalid', 'Type a command first.')
    if (command.length > 80) throw new RelayError('invalid', 'A command is at most 80 characters.')
    this.#mustBeLive(session)
    const result = runCommand(this.profile(session.profileId), command)
    const at = this.now().toISOString()
    const entry: TerminalEntry = { at, command, output: result.output, exit: result.exit }
    await this.#commit({
      ...this.#state,
      sessions: this.#state.sessions.map((s) => (s.id === session.id ? { ...s, lastActivityAt: at, entries: [...s.entries, entry] } : s)),
      audit: [...this.#state.audit, this.#event(session.id, command, result.allowed ? `Exit ${String(result.exit)}` : 'Denied')],
    })
    return entry
  }

  #mustBeLive(session: RemoteSession): void {
    const status = this.status(session)
    if (status === 'closed') throw new RelayError('conflict', `Session ${session.id} is closed. Open a new one.`)
    if (status === 'expired') throw new RelayError('conflict', `Session ${session.id} timed out after ${String(IDLE_MINUTES)} idle minutes. Open a new one.`)
  }

  async closeSession(sessionId: string): Promise<RemoteSession> {
    const session = this.session(sessionId)
    if (session.closedAt !== undefined) throw new RelayError('conflict', `Session ${session.id} is already closed.`)
    const at = this.now().toISOString()
    const closed: RemoteSession = { ...session, closedAt: at }
    await this.#commit({
      ...this.#state,
      sessions: this.#state.sessions.map((s) => (s.id === session.id ? closed : s)),
      audit: [...this.#state.audit, this.#event(session.id, 'Session closed', 'OK')],
      transfers: this.#state.transfers.map((t) => (t.sessionId === session.id && (t.state === 'queued' || t.state === 'ready' || t.state === 'running') ? { ...t, state: 'cancelled' as const } : t)),
    })
    return closed
  }

  /** Queue the next sample file on a live session; a name already in the session's queue is refused (overwrite is off). */
  async queueTransfer(sessionId: string): Promise<TransferJob> {
    const session = this.session(sessionId)
    this.#mustBeLive(session)
    const existing = this.transfers(session.id)
    const sample = SAMPLE_FILES.find((f) => !existing.some((t) => t.name === f.name && t.path === f.path))
    if (sample === undefined) throw new RelayError('conflict', 'Every sample file is already in the queue (overwrite is off).')
    const job: TransferJob = { id: this.#adapters.newId('transfer'), sessionId: session.id, ...sample, state: 'queued' }
    await this.#commit({ ...this.#state, transfers: [...this.#state.transfers, job], audit: [...this.#state.audit, this.#event(session.id, `Transfer queued: ${job.name}`, 'Queued')] })
    return job
  }

  /** Move a transfer one step: queued, ready, running, completed. */
  async advanceTransfer(id: string): Promise<TransferJob> {
    const job = this.#state.transfers.find((t) => t.id === id)
    if (job === undefined) throw new RelayError('not-found', 'There is no such transfer.')
    const next = NEXT_STATE[job.state]
    if (next === undefined) throw new RelayError('conflict', `${job.name} is ${job.state}; it cannot move on.`)
    if (next !== 'ready') this.#mustBeLive(this.session(job.sessionId))
    const moved: TransferJob = { ...job, state: next }
    await this.#commit({
      ...this.#state,
      transfers: this.#state.transfers.map((t) => (t.id === id ? moved : t)),
      audit: [...this.#state.audit, this.#event(job.sessionId, `Transfer ${job.name}: ${next}`, next === 'completed' ? 'Checksum OK' : undefined)],
    })
    return moved
  }

  async cancelTransfer(id: string): Promise<TransferJob> {
    const job = this.#state.transfers.find((t) => t.id === id)
    if (job === undefined) throw new RelayError('not-found', 'There is no such transfer.')
    if (job.state === 'completed' || job.state === 'cancelled') throw new RelayError('conflict', `${job.name} is already ${job.state}.`)
    const cancelled: TransferJob = { ...job, state: 'cancelled' }
    await this.#commit({
      ...this.#state,
      transfers: this.#state.transfers.map((t) => (t.id === id ? cancelled : t)),
      audit: [...this.#state.audit, this.#event(job.sessionId, `Transfer ${job.name}: cancelled`)],
    })
    return cancelled
  }
}
