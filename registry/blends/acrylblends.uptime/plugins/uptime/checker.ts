/**
 * The outside check, behind a port: the app's server uses {@link defaultChecker}, which asks an HTTP endpoint or opens a TCP connection; tests pass
 * {@link fakeChecker} and need no network. A check never throws: a failure is an answer with `ok: false` and its reason.
 */
import { connect } from 'node:net'
import type { Monitor } from './domain.ts'
import { targetText } from './domain.ts'

export interface CheckResult {
  readonly ok: boolean
  readonly statusCode: number
  readonly latencyMs: number
  readonly error?: string
}

export interface Checker {
  check(monitor: Monitor): Promise<CheckResult>
}

/** The real checker: `fetch` for HTTP(S) with the monitor's timeout, a TCP connection for the rest. */
export function defaultChecker(fetcher: typeof fetch = fetch): Checker {
  return {
    async check(monitor) {
      const started = Date.now()
      if (monitor.protocol === 'tcp') {
        const [host, portText] = monitor.target.split(':')
        const port = Number(portText ?? 0)
        return new Promise<CheckResult>((resolve) => {
          const socket = connect({ host: host ?? monitor.target, port, timeout: monitor.timeoutMs })
          const done = (result: Omit<CheckResult, 'latencyMs'>): void => {
            socket.destroy()
            resolve({ ...result, latencyMs: Date.now() - started })
          }
          socket.once('connect', () => done({ ok: true, statusCode: 0 }))
          socket.once('timeout', () => done({ ok: false, statusCode: 0, error: 'connection timed out' }))
          socket.once('error', (error) => done({ ok: false, statusCode: 0, error: error.message }))
        })
      }
      try {
        const response = await fetcher(targetText(monitor), {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(monitor.timeoutMs),
        })
        await response.body?.cancel()
        const ok = response.status === monitor.expectedStatus
        return {
          ok,
          statusCode: response.status,
          latencyMs: Date.now() - started,
          ...(ok ? {} : { error: `expected HTTP ${String(monitor.expectedStatus)}, got ${String(response.status)}` }),
        }
      } catch (error) {
        return { ok: false, statusCode: 0, latencyMs: Date.now() - started, error: (error as Error).message }
      }
    },
  }
}

/** A checker that answers from a function or a fixed result; the tests' stand-in for the network. */
export function fakeChecker(answer: CheckResult | ((monitor: Monitor) => CheckResult | Promise<CheckResult>)): Checker {
  return {
    async check(monitor) {
      return typeof answer === 'function' ? answer(monitor) : answer
    },
  }
}
