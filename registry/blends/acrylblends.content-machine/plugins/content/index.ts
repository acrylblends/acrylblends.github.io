/**
 * The content machine's domain as a plugin: projects, the brand, the media library and the jobs, under the app's data home
 * (`<home>/content-machine/`), provided as `ctx.content`. Every step plugin (transcribe, cut, sound, visuals, shorts, posts) injects `content` and
 * registers its feature; so do the API, the screen and the agent's tools. Switching this row off takes them all.
 *
 * Owned while active: every running job (stopped when the plugin unloads).
 *
 * Config (optional): `dir` (relative to the app's home, default `content-machine`), `ffmpeg` and `ffprobe` (program paths, default from the PATH).
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Machine } from './machine.ts'

export * from './edit.ts'
export * from './machine.ts'
export * from './media.ts'
export * from './model.ts'
export * from './settings.ts'
export * from './hyperframes.ts'
export * from './stages.ts'
export * from './project-settings.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    content: Machine
  }
}

export interface ContentConfig {
  readonly dir?: string
  readonly ffmpeg?: string
  readonly ffprobe?: string
}

export const name = 'content'
export const inject = ['appInstance']

export function apply(ctx: Context, config: ContentConfig = {}): void {
  const home = ctx.appInstance.home
  const dir = config.dir === undefined ? join(home, 'content-machine') : isAbsolute(config.dir) ? config.dir : join(home, config.dir)
  const machine = new Machine({
    root: dir,
    tools: { ffmpeg: config.ffmpeg ?? process.env.ACRYL_FFMPEG ?? 'ffmpeg', ffprobe: config.ffprobe ?? process.env.ACRYL_FFPROBE ?? 'ffprobe' },
  })
  ctx.effect(() => () => machine.stopAll(), 'content: running jobs')
  ctx.provide('content', machine)
}
