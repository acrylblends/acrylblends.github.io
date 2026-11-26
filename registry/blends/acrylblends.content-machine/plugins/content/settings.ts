/**
 * The two outside services the machine may use, set in its Settings page and kept in the app's home, owner-readable only (0600), never in the app's
 * code: the writer (any OpenAI-compatible chat API; DeepSeek by default) and the transcriber (any OpenAI-compatible speech-to-text API). Without a
 * file, the environment names them: DEEPSEEK_API_KEY for the writer, OPENAI_API_KEY for the transcriber.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Refusal } from './model.ts'

export interface ServiceConfig {
  readonly baseUrl: string
  readonly model: string
  readonly apiKey?: string
}

export type ServiceName = 'writer' | 'transcriber'

const DEFAULTS: Record<ServiceName, { baseUrl: string; model: string; env: string }> = {
  writer: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', env: 'DEEPSEEK_API_KEY' },
  transcriber: { baseUrl: 'https://api.openai.com/v1', model: 'whisper-1', env: 'OPENAI_API_KEY' },
}

const fileOf = (root: string, service: ServiceName) => join(root, 'settings', `${service}.json`)

/** The service's configuration: the saved file, else the environment's key with the default address, else undefined. */
export function serviceConfig(root: string, service: ServiceName, env: NodeJS.ProcessEnv = process.env): ServiceConfig | undefined {
  const file = fileOf(root, service)
  if (existsSync(file)) {
    if (process.platform !== 'win32' && (statSync(file).mode & 0o077) !== 0)
      throw new Refusal('unavailable', `${file} can be read by others: it holds a key, so it must be the owner's only (chmod 600)`)
    const saved = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServiceConfig>
    if (typeof saved.baseUrl === 'string' && typeof saved.model === 'string' && saved.baseUrl !== '' && saved.model !== '')
      return { baseUrl: saved.baseUrl, model: saved.model, ...(typeof saved.apiKey === 'string' && saved.apiKey !== '' ? { apiKey: saved.apiKey } : {}) }
  }
  const key = env[DEFAULTS[service].env]
  if (key) return { baseUrl: DEFAULTS[service].baseUrl, model: DEFAULTS[service].model, apiKey: key }
  return undefined
}

/** What the Settings page shows: where it points and whether a key is set, never the key. */
export function describeService(root: string, service: ServiceName): { configured: boolean; baseUrl: string; model: string; keySet: boolean; from: 'settings' | 'environment' | 'none'; env: string } {
  const env = DEFAULTS[service].env
  let config: ServiceConfig | undefined
  try { config = serviceConfig(root, service) } catch { config = undefined }
  const from = existsSync(fileOf(root, service)) ? 'settings' : config ? 'environment' : 'none'
  return { configured: config !== undefined, baseUrl: config?.baseUrl ?? DEFAULTS[service].baseUrl, model: config?.model ?? DEFAULTS[service].model, keySet: config?.apiKey !== undefined, from, env }
}

/** Saves a service's address, model and (when given) key; a blank key keeps the saved one. */
export function saveService(root: string, service: ServiceName, change: { baseUrl?: unknown; model?: unknown; apiKey?: unknown }): void {
  const baseUrl = typeof change.baseUrl === 'string' ? change.baseUrl.trim() : ''
  const model = typeof change.model === 'string' ? change.model.trim() : ''
  if (!/^https?:\/\/\S+$/.test(baseUrl)) throw new Refusal('invalid', 'the address is an http(s) URL, like https://api.deepseek.com/v1')
  if (model === '') throw new Refusal('invalid', 'the model is required')
  let apiKey = typeof change.apiKey === 'string' ? change.apiKey.trim() : ''
  if (apiKey === '') {
    try { apiKey = serviceConfig(root, service, {})?.apiKey ?? '' } catch { apiKey = '' }
  }
  mkdirSync(join(root, 'settings'), { recursive: true, mode: 0o700 })
  const file = fileOf(root, service)
  writeFileSync(file, `${JSON.stringify({ baseUrl, model, ...(apiKey === '' ? {} : { apiKey }) }, null, 2)}\n`, { mode: 0o600 })
  chmodSync(file, 0o600)
}

export interface ChatMessage {
  readonly role: 'system' | 'user'
  readonly content: string
}

/** One answer from the writer, asked for JSON; refuses when no writer is set. */
export async function writeJson(root: string, messages: readonly ChatMessage[], signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  const config = serviceConfig(root, 'writer')
  if (!config) throw new Refusal('unavailable', 'no writer is set: add an AI model in Settings (DeepSeek works), or set DEEPSEEK_API_KEY')
  const response = await fetcher(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.7, response_format: { type: 'json_object' } }),
    ...(signal ? { signal } : {}),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`the writer answered ${response.status}: ${text.slice(0, 300)}`)
  const content = (JSON.parse(text) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? ''
  try {
    return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    throw new Error('the writer did not answer JSON; try again')
  }
}
