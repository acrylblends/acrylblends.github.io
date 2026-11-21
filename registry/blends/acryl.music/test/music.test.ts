import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '@acryldev/instance'
import { type App, createApp } from '../src/app.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

async function withHome(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(scratch, 'music-'))
  try {
    await run(home)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}
async function withApp(home: string, run: (app: App) => Promise<void>) {
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), { listen: false })
  try {
    await run(app)
  } finally {
    await app.stop()
  }
}
const send = (app: App, path: string, payload?: unknown) =>
  app.root.router.request(`/music/${path}`, payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
type State = { pattern: { tempo: number; steps: number; tracks: Record<string, string> }; saved: Record<string, unknown> }
const state = async (response: Response) => (await response.json()) as State

test('the drum machine is on the first screen, with its synthesizer', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const html = await (await app.root.router.request('/', { headers: { accept: 'text/html' } })).text()
      assert.ok(html.includes('data-test="music"'))
      assert.ok(html.includes('createOscillator'), 'the page plays the pattern with WebAudio')
      assert.ok(html.includes('"hiphop"') || html.includes('hiphop'), 'the styles are listed')
    })))

test('what the agent does through the routes changes the pattern: style, tempo, beats, steps, a single step, a whole track, clear', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      assert.equal((await state(await send(app, 'state'))).pattern.tempo, 120)
      const techno = await state(await send(app, 'style', { style: 'techno' }))
      assert.equal(techno.pattern.steps, 16)
      assert.match(techno.pattern.tracks.kick ?? '', /^[x.]{16}$/u)
      assert.equal((await state(await send(app, 'tempo', { bpm: 90 }))).pattern.tempo, 90)
      assert.equal((await send(app, 'tempo', { bpm: 999 })).status, 422)
      const beats = await state(await send(app, 'beats', { track: 'snare', beats: '2, 4', replace: true }))
      assert.equal(beats.pattern.tracks.snare, '....x.......x...')
      const stepped = await state(await send(app, 'step', { track: 'tom', step: 1, on: true }))
      assert.equal(stepped.pattern.tracks.tom?.[0], 'x')
      assert.equal((await send(app, 'step', { track: 'cowbell', step: 1, on: true })).status, 422)
      const track = await state(await send(app, 'track', { track: 'clap', pattern: 'x...x...x...x...' }))
      assert.equal(track.pattern.tracks.clap, 'x...x...x...x...')
      assert.equal((await send(app, 'track', { track: 'clap', pattern: 'x.x' })).status, 422)
      const eight = await state(await send(app, 'steps', { steps: 8 }))
      assert.equal(eight.pattern.steps, 8)
      assert.equal((await state(await send(app, 'clear', { track: 'kick' }))).pattern.tracks.kick, '........')
      const text = await (await app.root.router.request('/music/describe')).text()
      assert.match(text, /^90 bpm, 8 steps/u)
    })))

test('patterns are saved by name, loaded, and deleted; a wrong style or name is refused', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const house = await state(await send(app, 'style', { style: 'house' }))
      assert.deepEqual(Object.keys((await state(await send(app, 'save', { name: 'my house' }))).saved), ['my house'])
      await send(app, 'style', { style: 'techno' })
      const loaded = await state(await send(app, 'load', { name: 'my house' }))
      assert.deepEqual(loaded.pattern, house.pattern)
      assert.equal((await send(app, 'load', { name: 'nope' })).status, 422)
      assert.equal((await send(app, 'style', { style: 'polka?' })).status, 422)
      assert.equal((await send(app, 'save', { name: '' })).status, 422)
      assert.deepEqual((await state(await send(app, 'delete', { name: 'my house' }))).saved, {})
    })))

test('the pattern survives a restart', () =>
  withHome(async (home) => {
    await withApp(home, async (app) => { await send(app, 'tempo', { bpm: 77 }) })
    await withApp(home, async (app) => {
      assert.equal((await state(await send(app, 'state'))).pattern.tempo, 77)
      assert.deepEqual(app.root.home.widgets().map((widget) => widget.id), ['music'])
    })
  }))
