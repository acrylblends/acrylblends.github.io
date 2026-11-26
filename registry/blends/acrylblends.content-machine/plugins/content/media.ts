/**
 * The machine's hands: ffmpeg and ffprobe (found on the PATH, or where the config says), run as child processes that a job can stop. ffmpeg reports how
 * far it is on `-progress pipe:1`; that becomes the job's progress.
 */
import { spawn } from 'node:child_process'
import { Refusal } from './model.ts'

export interface Tools {
  readonly ffmpeg: string
  readonly ffprobe: string
}

export interface RunOptions {
  readonly signal?: AbortSignal
  /** Seconds of output written so far, from ffmpeg's progress lines. */
  readonly onTime?: (seconds: number) => void
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  /** Every line the program writes (out and err): a renderer's own progress lines. */
  readonly onLine?: (line: string) => void
}

export interface RunResult {
  readonly stdout: string
  readonly stderr: string
}

/** Runs a program to the end; rejects with the last lines of its error output when it fails, with `stopped` when the signal fires. */
export function run(command: string, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new Error('stopped'))
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      return reject(error)
    }
    let stdout = ''
    let stderr = ''
    const stop = () => child.kill('SIGKILL')
    options.signal?.addEventListener('abort', stop, { once: true })
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      stdout = (stdout + chunk).slice(-2_000_000)
      if (options.onTime) for (const match of chunk.matchAll(/out_time_us=(\d+)/g)) options.onTime(Number(match[1]) / 1e6)
      if (options.onLine) for (const line of chunk.split(/[\r\n]+/)) if (line.trim() !== '') options.onLine(line)
    })
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-200_000)
      if (options.onLine) for (const line of chunk.split(/[\r\n]+/)) if (line.trim() !== '') options.onLine(line)
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      options.signal?.removeEventListener('abort', stop)
      reject(error.code === 'ENOENT' ? new Refusal('unavailable', `${command} is not installed (or not on the PATH)`) : error)
    })
    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', stop)
      if (options.signal?.aborted) return reject(new Error('stopped'))
      if (code === 0) return resolve({ stdout, stderr })
      const tail = stderr.trim().split('\n').slice(-6).join('\n')
      reject(new Error(`${command.split('/').pop()} failed (exit ${String(code)}): ${tail}`))
    })
  })
}

/** ffmpeg with the machine's fixed options: quiet, overwrite, progress on stdout. */
export function ffmpeg(tools: Tools, args: readonly string[], options: RunOptions = {}): Promise<RunResult> {
  return run(tools.ffmpeg, ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', ...args], options)
}

export interface Probe {
  readonly duration: number
  readonly width: number
  readonly height: number
  readonly hasVideo: boolean
  readonly hasAudio: boolean
}

export async function probe(tools: Tools, file: string, signal?: AbortSignal): Promise<Probe> {
  const { stdout } = await run(tools.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file], { signal })
  const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number }[] }
  const streams = data.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video')
  const duration = Number(data.format?.duration ?? 0)
  if (!Number.isFinite(duration) || duration <= 0) throw new Refusal('invalid', 'this file has no length: it is not audio or video ffprobe can read')
  return {
    duration,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    hasVideo: video !== undefined,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  }
}

/** Whether a program answers `-version`: the screen says which tools are missing before a step fails on them. */
export async function available(command: string): Promise<boolean> {
  try {
    await run(command, ['-version'])
    return true
  } catch {
    return false
  }
}

/** Pauses in the audio, from ffmpeg's silencedetect: where the sound stays under `db` for at least `min` seconds. */
export async function silences(tools: Tools, file: string, db: number, min: number, signal?: AbortSignal): Promise<{ start: number; end: number }[]> {
  const { stderr } = await run(tools.ffmpeg, ['-hide_banner', '-nostdin', '-i', file, '-vn', '-af', `silencedetect=noise=${db}dB:d=${min}`, '-f', 'null', '-'], { signal })
  return parseSilences(stderr)
}

export function parseSilences(log: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = []
  let start: number | undefined
  for (const line of log.split('\n')) {
    const s = /silence_start: (-?[\d.]+)/.exec(line)
    if (s) start = Math.max(0, Number(s[1]))
    const e = /silence_end: ([\d.]+)/.exec(line)
    if (e && start !== undefined) {
      found.push({ start, end: Number(e[1]) })
      start = undefined
    }
  }
  return found
}
