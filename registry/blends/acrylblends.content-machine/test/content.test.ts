import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '@acryldev/instance'
import { createApp } from '../src/app.ts'
import type {} from '../plugins/content/index.ts'
import { cues, keptRanges, lengthOf, Machine, parseSilences, type Removal, serviceConfig, saveService, settingsChange, srt, toCut, wordsOnCut } from '../plugins/content/index.ts'
import { cutGraph, fillers, likeness, pauses, retakes, suggest } from '../plugins/content-cut/index.ts'
import { musicMix, whooshTimes } from '../plugins/content-music/index.ts'
import { postsFrom } from '../plugins/content-posts/index.ts'
import { pickByDensity } from '../plugins/content-shorts/index.ts'
import { fromApi, fromFile, fromSubtitles } from '../plugins/content-transcribe/index.ts'
import { finalHtml, punchInTimes } from '../plugins/content-visuals/index.ts'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })
const removal = (start: number, end: number, kept = false, reason: Removal['reason'] = 'silence'): Removal => ({ id: `r${start}`, start, end, reason, text: '', kept })
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()

test('the cut keeps what is not removed, merges overlaps, and maps source times onto the cut', () => {
  const kept = keptRanges(10, [removal(2, 3), removal(2.5, 4), removal(6, 7, true), removal(9.95, 10)])
  assert.deepEqual(kept, [{ start: 0, end: 2 }, { start: 4, end: 9.95 }])
  assert.equal(Number(lengthOf(kept).toFixed(2)), 7.95)
  assert.equal(toCut(kept, 1), 1)
  assert.equal(toCut(kept, 3), undefined)
  assert.equal(toCut(kept, 5), 3)
  const words = wordsOnCut([{ text: 'a', start: 1, end: 1.5 }, { text: 'gone', start: 2.2, end: 2.8 }, { text: 'b', start: 4.5, end: 5 }], kept)
  assert.deepEqual(words.map((w) => [w.text, w.start]), [['a', 1], ['b', 2.5]])
})

test('captions: short lines, a new line after a sentence end or a gap, and SRT times', () => {
  const words = [
    { text: 'Hello', start: 0, end: 0.4 }, { text: 'there.', start: 0.45, end: 0.9 },
    { text: 'This', start: 1, end: 1.2 }, { text: 'is', start: 1.25, end: 1.4 }, { text: 'after', start: 2.5, end: 2.9 },
  ]
  const list = cues(words, 32, 0.6)
  assert.deepEqual(list.map((c) => c.text), ['Hello there.', 'This is', 'after'])
  assert.match(srt(list), /^1\n00:00:00,000 --> 00:00:00,900\nHello there\.\n/)
})

test('fillers, earlier takes and pauses are found; a pause inside an earlier take is not listed twice', () => {
  assert.deepEqual(fillers([{ text: 'Um,', start: 1, end: 1.3 }, { text: 'umbrella', start: 2, end: 2.5 }, { text: 'uhh', start: 3, end: 3.2 }]).map((r) => r.text), ['Um,', 'uhh'])
  assert.ok(likeness('It starts on the 25th of October.', 'It starts on the 25th of October, from 9 until 8.') >= 0.75)
  assert.ok(likeness('We build Tyler.', 'The weather is nice today.') < 0.5)
  const segments = [
    { text: 'It starts on the 25th of October.', start: 10, end: 13 },
    { text: 'It starts on the 25th of October, from 9 until 8.', start: 14, end: 18 },
  ]
  assert.deepEqual(retakes(segments).map((r) => [r.start, r.reason]), [[10, 'retake']])
  assert.deepEqual(pauses([{ start: 5, end: 6.5 }, { start: 8, end: 8.3 }]).map((r) => [r.start, r.end]), [[5.12, 6.38]])
  const all = suggest([], segments, [{ start: 13.1, end: 13.9 }, { start: 20, end: 21 }], { silenceMin: 0.7, silenceDb: -35, cutFillers: true, cutRetakes: true })
  assert.deepEqual(all.map((r) => r.reason), ['retake', 'silence'])
  assert.deepEqual(all.map((r) => r.id), ['r1', 'r2'])
})

test('silencedetect lines become pauses', () => {
  assert.deepEqual(parseSilences('[silencedetect] silence_start: 2.4\n[silencedetect] silence_end: 4.0 | silence_duration: 1.6\nsilence_start: -0.01\nsilence_end: 0.5'), [{ start: 2.4, end: 4 }, { start: 0, end: 0.5 }])
})

test('transcripts from a speech API answer, SRT, VTT and word JSON', () => {
  const api = fromApi({ text: 'Hi there', language: 'english', words: [{ word: 'Hi', start: 0, end: 0.3 }, { word: 'there', start: 0.4, end: 0.8 }], segments: [{ start: 0, end: 0.8, text: ' Hi there' }] }, 600)
  assert.deepEqual(api.words.map((w) => w.start), [600, 600.4])
  assert.equal(api.segments[0]!.text, 'Hi there')
  const srtLines = fromSubtitles('1\n00:00:01,000 --> 00:00:02,500\nHello <i>world</i>\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond')
  assert.deepEqual(srtLines, [{ start: 1, end: 2.5, text: 'Hello world' }, { start: 3, end: 4, text: 'Second' }])
  const vtt = fromFile('a.vtt', 'WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nOne two\n')
  assert.equal(vtt.words.length, 2)
  assert.equal(vtt.estimatedWords, true)
  assert.equal(Number(vtt.words[1]!.end.toFixed(3)), 2)
  const json = fromFile('t.json', JSON.stringify({ words: [{ text: 'So,', start: 0.1, end: 0.3 }, { text: 'yes.', start: 0.35, end: 0.6 }] }))
  assert.equal(json.estimatedWords, false)
  assert.equal(json.segments.length, 1)
  assert.throws(() => fromFile('x.srt', 'nothing here'), /no subtitle lines/)
})

test('the cut graph keeps each stretch with a fade and runs the voice chain and the mixes after the join', () => {
  const graph = cutGraph([{ start: 0, end: 1 }, { start: 2, end: 3.5 }], true, ['loudnorm'], [{ inputs: 1, graph: (voice, first, out) => `[${voice}][${first}:a]amix=inputs=2[${out}]` }])
  assert.match(graph.graph, /\[0:v\]split=2\[sv0\]\[sv1\]/)
  assert.match(graph.graph, /atrim=start=2\.000:end=3\.500,asetpts=PTS-STARTPTS,afade=t=in:d=0\.01,afade=t=out:st=1\.490/)
  assert.match(graph.graph, /\[joined\]loudnorm\[voice\];\[voice\]\[1:a\]amix=inputs=2\[mix0\]/)
  assert.equal(graph.audio, 'mix0')
  assert.equal(graph.video, 'vout')
})

test('music: whooshes only at scene changes, a ducked bed, nothing when neither is on', () => {
  assert.deepEqual(whooshTimes([0.2, 1, 2, 5, 5.5, 9]), [1, 5, 9])
  const base = { music: { volume: 0.2, duck: true, whooshOnCuts: false } } as never
  assert.equal(musicMix(base, { duration: 10, joins: [], root: '' }, (f) => f), undefined)
  const mix = musicMix({ music: { track: 'bed.m4a', volume: 0.2, duck: true, whooshOnCuts: true } } as never, { duration: 10, joins: [4], root: '' }, (f) => `/lib/${f}`)!
  assert.deepEqual(mix.inputs.map((i) => i.args.at(-1)), ['/lib/bed.m4a', 'anoisesrc=d=0.6:c=pink:a=0.6:r=48000'])
  const graph = mix.graph('voice', 1, 'out')
  assert.match(graph, /sidechaincompress/)
  assert.match(graph, /adelay=3700\|3700/)
  assert.match(graph, /\[speech\]\[ducked\]\[wd0\]amix=inputs=3:duration=first:normalize=0\[out\]/)
})

test('the finished video composition follows the HyperFrames contract', () => {
  const html = finalHtml({
    width: 1280, height: 720, duration: 12, video: 'cut.mp4', cues: cues([{ text: 'Hello', start: 0.5, end: 1 }]), captions: { enabled: true, style: 'karaoke' },
    title: 'A <title>', subtitle: '', brand: { color: '#ff0000', name: 'B' }, overlays: [{ id: 'o1', file: 'a.png', kind: 'image', at: 2, duration: 3, src: 'a.png' }],
    punchIns: punchInTimes([{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 5, end: 6 }, { text: 'c', start: 7, end: 8 }]), progressBar: true,
  })
  assert.match(html, /data-composition-id="final" data-width="1280" data-height="720" data-duration="12"/)
  assert.match(html, /window\.__timelines\["final"\]=tl/)
  assert.match(html, /A &lt;title&gt;/)
  assert.match(html, /tl\.set\('#c0w0',\{color:'#ff0000'\},0\.5\)/)
  assert.match(html, /tl\.set\('#cam',\{scale:1\.08\},5\)/)
  assert.doesNotMatch(html, /tl\.set\('#cam',\{scale:1\},7\)/)
})

test('shorts without a writer: the densest stretches that do not overlap', () => {
  const lines = Array.from({ length: 12 }, (_, i) => ({ text: i % 3 === 0 ? 'one two three four five six seven eight' : 'one two', start: i * 6, end: i * 6 + 5.5 }))
  const picked = pickByDensity(lines, 2)
  assert.equal(picked.length, 2)
  for (const p of picked) assert.ok(p.end - p.start >= 20 && p.end - p.start <= 45)
  assert.ok(picked[0]!.end <= picked[1]!.start)
})

test('posts: every field cut to a fair length, an empty answer refused', () => {
  const posts = postsFrom({ youtube: { title: 'T'.repeat(200), description: 'D', tags: ['a', 7, 'b'] }, linkedin: 'L', instagram: 'I', x: 'X'.repeat(400), thumbnailText: 'Big' }, 'now')
  assert.equal(posts.youtube.title.length, 100)
  assert.deepEqual(posts.youtube.tags, ['a', 'b'])
  assert.equal(posts.x.length, 280)
  assert.throws(() => postsFrom({}, 'now'), /without posts/)
})

test('services: a key is saved owner-only and never shown; the environment is the fallback', async () => {
  const root = await mkdtemp(join(scratch, 'svc-'))
  const key = ['test', 'key'].join('-') // built at run time: the template's secret scan refuses a literal key
  try {
    assert.equal(serviceConfig(root, 'writer', {}), undefined)
    assert.equal(serviceConfig(root, 'writer', { DEEPSEEK_API_KEY: 'k' })?.baseUrl, 'https://api.deepseek.com/v1')
    saveService(root, 'writer', { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: key })
    if (process.platform !== 'win32') assert.equal(statSync(join(root, 'settings', 'writer.json')).mode & 0o777, 0o600)
    saveService(root, 'writer', { baseUrl: 'https://api.example.com/v1', model: 'm2', apiKey: '' })
    assert.deepEqual(serviceConfig(root, 'writer', {}), { baseUrl: 'https://api.example.com/v1', model: 'm2', apiKey: key })
    assert.throws(() => saveService(root, 'writer', { baseUrl: 'ftp://x', model: 'm' }), /http\(s\) URL/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('settings changes are checked, and what they make old is dropped', async () => {
  const root = await mkdtemp(join(scratch, 'set-'))
  try {
    const machine = new Machine({ root, tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' } })
    const project = { ...machine.create('Test'), outputs: { cut: { file: 'cut.mp4', at: '', bytes: 1 }, final: { file: 'final.mp4', at: '', bytes: 1 } } }
    assert.deepEqual(settingsChange(machine, project, { captions: { style: 'karaoke' } }).outputs, { cut: project.outputs.cut, final: undefined })
    assert.deepEqual(settingsChange(machine, project, { sound: { preset: 'podcast' } }).outputs, { cut: undefined, final: undefined })
    assert.throws(() => settingsChange(machine, project, { sound: { preset: 'loud' } }), /one of off, clean, podcast/)
    assert.throws(() => settingsChange(machine, project, { music: { track: 'missing.mp3' } }), /no missing\.mp3/)
    assert.throws(() => machine.update(project.id, () => ({}), 99), /changed since you read it/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('steps come and go with their plugins; one job at a time per project; a job can be stopped', async () => {
  const root = await mkdtemp(join(scratch, 'job-'))
  try {
    const machine = new Machine({ root, tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' } })
    const project = machine.create('Jobs')
    const remove = machine.features.register({
      id: 'wait', title: 'Wait', order: 1, summary: '',
      actions: { go: { title: 'Go', description: '', run: (context) => new Promise((resolve, reject) => { context.progress(0.5, 'half'); context.signal.addEventListener('abort', () => reject(new Error('stopped'))); setTimeout(resolve, 5000, 'late') }) } },
    })
    assert.deepEqual(machine.features.list().map((f) => f.id), ['wait'])
    const { job, done } = machine.start(project.id, 'wait', 'go')
    assert.throws(() => machine.start(project.id, 'wait', 'go'), /still running/)
    machine.stop(job.id)
    await assert.rejects(done, /stopped/)
    assert.equal(machine.jobsOf(project.id)[0]!.status, 'stopped')
    remove()
    assert.throws(() => machine.start(project.id, 'wait', 'go'), /no step wait/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('the API takes changes only from its own page', async () => {
  const home = await mkdtemp(join(scratch, 'api-'))
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), { listen: false })
  try {
    const request = (path: string, init?: RequestInit) => app.root.router.request(path, init)
    const created = await request('/content/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'API' }) })
    const { project } = (await created.json()) as { project: { id: string } }
    assert.equal((await request('/content/api/projects', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 403)
    assert.equal((await request('/content/api/projects', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', host: 'localhost' }, body: '{"name":"x"}' })).status, 403)
    assert.equal((await request(`/content/api/projects/${project.id}/upload?name=a.mp4`, { method: 'POST', body: 'data' })).status, 403)
    const up = await request(`/content/api/projects/${project.id}/upload?name=${encodeURIComponent('../../evil.mp4')}`, { method: 'POST', headers: { 'x-content-machine': 'upload' }, body: 'data' })
    assert.equal(((await up.json()) as { file: string }).file, 'uploads/evil.mp4')
    const file = await request(`/content/api/projects/${project.id}/files/uploads/evil.mp4`, { headers: { range: 'bytes=1-2' } })
    assert.equal(file.status, 206)
    assert.equal(await file.text(), 'at')
    assert.equal((await request(`/content/api/projects/${project.id}/files/..%2F..%2Fbrand.json`)).status, 400)
    const run = await request(`/content/api/projects/${project.id}/run/nope/go`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    assert.equal(run.status, 404)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('a real cut: ffmpeg keeps the stretches, joins them, and cleans the voice', { skip: hasFfmpeg ? false : 'ffmpeg is not installed' }, async () => {
  const home = await mkdtemp(join(scratch, 'cut-'))
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), { listen: false })
  try {
    const machine = app.root.content
    const project = machine.create('Real cut')
    const dir = machine.projectDir(project.id)
    mkdirSync(join(dir, 'uploads'), { recursive: true })
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=440:d=4', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(dir, 'uploads', 'clip.mp4')])
    await machine.start(project.id, 'ingest', 'upload', { file: 'uploads/clip.mp4' }).done
    assert.ok(existsSync(join(dir, 'peaks.json')))
    assert.ok((JSON.parse(readFileSync(join(dir, 'peaks.json'), 'utf8')) as number[]).length > 100)
    machine.update(project.id, () => ({ removals: [removal(1, 2)] }))
    const cut = (await machine.start(project.id, 'cut', 'render').done) as { duration: number }
    assert.ok(Math.abs(cut.duration - 3) < 0.15, `the cut is 3 s, not ${cut.duration}`)
  } finally {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  }
})

test('available() asks each program the way it answers: yt-dlp knows only --version', async () => {
  const { available } = await import('../plugins/content/media.ts')
  // node, like yt-dlp, rejects the single-dash flag ffmpeg uses; with --version it answers.
  assert.equal(await available(process.execPath, '-version'), false)
  assert.equal(await available(process.execPath, '--version'), true)
  assert.equal(await available('no-such-program-content-machine'), false)
})
