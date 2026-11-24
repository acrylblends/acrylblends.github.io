/**
 * The chat's last turn as AOS shows it: tool steps and model steps apart, tokens from the provider's usage. The frame's chat is the DSH agent in this
 * same host; its session events (`session/event`) carry each model answer with the provider's `usage` and each tool call with its arguments, so AOS reads
 * them as they happen instead of counting anything itself. Kept in memory: the last turn of each session.
 */
import type { Context } from '@deepseek-ai/cordis'

export interface RunStep {
  readonly kind: 'model' | 'tool'
  readonly text: string
  /** Model steps: the provider's total tokens for that answer. Tool steps: 0. */
  readonly tokens: number
  readonly tool?: string
  readonly args?: unknown
  /** One of this computer's tools, which a workflow can replay. */
  readonly ours?: boolean
  failed?: boolean
}
export interface RunView {
  readonly steps: readonly RunStep[]
  readonly tokens: number
  readonly title?: string
  readonly session?: string
  /** `<session>:<turn>`, new for each turn. */
  readonly turn?: string
}

interface SessionEventLike { readonly type: string; readonly time?: number; readonly data?: Record<string, unknown> }
interface Turn { session: string; turn: number; title: string; steps: RunStep[]; at: number }

const textOf = (content: unknown): string => (Array.isArray(content) ? content : [])
  .filter((part): part is { type: string, text: string } => (part as { type?: string })?.type === 'text' && typeof (part as { text?: unknown }).text === 'string')
  .map((part) => part.text).join(' ').trim()

/** Fold one session event into its turn. Pure, so a test feeds it the events a real turn produced. */
export function foldEvent(turns: Map<string, Turn>, session: string, event: SessionEventLike, ours: ReadonlySet<string>): void {
  const data = event.data ?? {}
  const current = turns.get(session)
  if (event.type === 'turn/start') {
    turns.set(session, { session, turn: Number(data.turn), title: '', steps: [], at: event.time ?? Date.now() })
    return
  }
  if (current === undefined) return
  if (event.type === 'user/message' && current.title === '') current.title = textOf(data.content).slice(0, 80)
  else if (event.type === 'assistant/message') {
    const message = data.message as { content?: unknown } | undefined
    const calls = (Array.isArray(message?.content) ? message.content : []).filter((p) => (p as { type?: string }).type === 'tool-call').map((p) => (p as { name: string }).name)
    const said = textOf(message?.content)
    const usage = data.usage as { totalTokens?: number } | undefined
    current.steps.push({ kind: 'model', text: said !== '' ? said.slice(0, 140) : calls.length > 0 ? `plan: ${calls.join(', ')}` : 'thinking', tokens: usage?.totalTokens ?? 0 })
  } else if (event.type === 'tool/call') {
    const name = String(data.name)
    let args: unknown = data.arguments
    try { args = typeof args === 'string' ? JSON.parse(args) : args } catch { /* kept as the text the model sent */ }
    current.steps.push({ kind: 'tool', tool: name, args, text: typeof data.arguments === 'string' ? data.arguments.slice(0, 120) : '', tokens: 0, ours: ours.has(name) })
  } else if (event.type === 'tool/result' && (data.message as { isError?: boolean } | undefined)?.isError === true) {
    const last = [...current.steps].reverse().find((s) => s.kind === 'tool')
    if (last !== undefined) last.failed = true
  }
}

export function viewOf(turn: Turn | undefined): RunView | undefined {
  if (turn === undefined) return undefined
  return { steps: turn.steps, tokens: turn.steps.reduce((sum, s) => sum + s.tokens, 0), title: turn.title, session: turn.session, turn: `${turn.session}:${turn.turn}` }
}

/** Listen to the chat's sessions while the plugin lives; `last()` is the most recent turn of any session. */
export function watchRuns(ctx: Context, ours: ReadonlySet<string>): { last(): RunView | undefined, tokens(): number } {
  const turns = new Map<string, Turn>()
  let tokens = 0
  ;(ctx as unknown as { on(name: string, listener: (session: { id: string }, event: SessionEventLike) => void): () => void })
    .on('session/event', (session, event) => {
      if (event.type === 'assistant/message') tokens += (event.data?.usage as { totalTokens?: number } | undefined)?.totalTokens ?? 0
      foldEvent(turns, session.id, event, ours)
    })
  return { last: () => viewOf([...turns.values()].sort((a, b) => b.at - a.at)[0]), tokens: () => tokens }
}
