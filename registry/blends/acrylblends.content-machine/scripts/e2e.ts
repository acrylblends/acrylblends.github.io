// Every step on a real recording, in the app as it runs (a throwaway home, the app reached in process): bring the sample in, import its transcript,
// find and render the cut with the sound chain and music, render the finished video, pick and render shorts, make the thumbnail and write the posts.
// Usage: node --import ./plugins/node-server/src/register.ts scripts/e2e.ts <recording> <transcript.json> [home]
// The writer steps run when DEEPSEEK_API_KEY (or a writer in Settings) is there and are skipped otherwise.
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '@acryldev/instance'
import { createApp } from '../src/app.ts'
import type {} from '../plugins/content/index.ts'

const [recording, transcript, homeArg] = process.argv.slice(2)
if (!recording || !transcript) throw new Error('usage: e2e.ts <recording> <transcript.json> [home]')
const root = fileURLToPath(new URL('..', import.meta.url))
const home = resolve(homeArg ?? join(root, '.acrylblends', 'e2e-home'))
mkdirSync(home, { recursive: true })
const app = await createApp(withPort(pinnedInstance(home, { root }), 0), { listen: false })
const machine = app.root.content
const t0 = Date.now()
const step = async (feature: string, action: string, input: Record<string, unknown> = {}) => {
  const started = Date.now()
  const { done } = machine.start(project.id, feature, action, input)
  const result = await done
  console.log(`${feature}.${action}: ${((Date.now() - started) / 1000).toFixed(1)} s ${JSON.stringify(result)?.slice(0, 220) ?? ''}`)
  return result
}
const request = (path: string, init?: RequestInit) => app.root.router.request(path, init)

let project = machine.create('Workshop promo')
try {
  // Upload through the API, as the screen does.
  const up = await request(`/content/api/projects/${project.id}/upload?name=${encodeURIComponent('rough take.mp4')}`, { method: 'POST', headers: { 'x-content-machine': 'upload', 'content-type': 'application/octet-stream' }, body: readFileSync(recording) })
  const uploaded = (await up.json()) as { file: string }
  console.log('upload:', up.status, uploaded.file)
  await step('ingest', 'upload', { file: uploaded.file })
  const tr = await request(`/content/api/projects/${project.id}/upload?name=transcript.json`, { method: 'POST', headers: { 'x-content-machine': 'upload' }, body: readFileSync(transcript) })
  await step('transcribe', 'import', { file: ((await tr.json()) as { file: string }).file })
  await step('cut', 'suggest')
  project = machine.get(project.id)
  for (const r of project.removals) console.log(`  ${r.reason.padEnd(7)} ${r.start.toFixed(2)}-${r.end.toFixed(2)} ${r.text}`)
  await step('music', 'make-bed')
  machine.update(project.id, (p) => ({ sound: { preset: 'podcast' }, music: { ...p.music, whooshOnCuts: true }, visuals: { ...p.visuals, title: 'Build your AI video editor', subtitle: 'Workshop · 25 October · Vienna', progressBar: true } }))
  machine.setBrand({ name: 'Vienna AI Workshops', about: 'Hands-on workshops where people build their own AI coworkers.', audience: 'founders and creators', offers: 'Workshop on 25 October, 9:00 to 20:00, in Vienna', callToAction: 'Book a seat', color: '#F59E0B' })
  await step('sound', 'preview')
  await step('cut', 'render')
  await step('visuals', 'render')
  const writer = Boolean(process.env.DEEPSEEK_API_KEY)
  if (writer) await step('posts', 'write', { note: 'the workshop on 25 October' })
  await step('shorts', 'suggest', { count: 2 })
  await step('shorts', 'render')
  await step('thumbnail', 'make')
  project = machine.get(project.id)
  console.log('outputs:', JSON.stringify(project.outputs))
  console.log('shorts:', JSON.stringify(project.shorts.map((s) => ({ title: s.title, start: s.start, end: s.end, file: s.output?.file }))))
  if (project.posts) console.log('youtube title:', project.posts.youtube.title)
  console.log(`project folder: ${machine.projectDir(project.id)}`)
  console.log(`all steps: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
} finally {
  await app.stop()
}
