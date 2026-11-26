#!/usr/bin/env node
// Makes a messy sample recording to try the machine without a video of your own (macOS only: it speaks with `say`): fillers, a sentence said twice,
// long pauses, over a moving gradient. Each word is spoken on its own, so its time is known exactly, and the transcript is written next to it as JSON
// (the format "Use an SRT, VTT or JSON file" reads). Usage: node scripts/make-sample.mjs [out-folder]   (default: .acrylblends/sample)
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2] ?? '.acrylblends/sample'
const work = join(out, 'words')
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

// A pause in seconds, or a line of words. Fillers and the repeated sentence are what the cut should find.
const script = [
  'So, um, this is a prompt video.', 1.4,
  'Um, please take this and make it into an amazing ad video.', 0.9,
  'Like, uh, I am totally ashamed of this mess.', 1.3,
  'The workshop starts on the twenty fifth of October.', 0.5,
  'The workshop starts on the twenty fifth of October, from nine in the morning until eight in the evening.', 0.8,
  'We are going to build Tyler, your AI video editor.', 0.4,
  'Uh, it cuts the bad takes, raises the audio quality, and adds music.', 1.1,
  'For twenty one days, you post one video per day.', 0.6,
  'Tyler is your first digital coworker.', 0.8,
]

const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())
const parts = []
const words = []
let at = 0.4
let n = 0
parts.push({ silence: 0.4 })
for (const item of script) {
  if (typeof item === 'number') { parts.push({ silence: item }); at += item; continue }
  for (const word of item.split(' ')) {
    const file = join(work, `${String(n++).padStart(3, '0')}.aiff`)
    execFileSync('say', ['-v', 'Samantha', '-r', '185', '-o', file, word.replace(/[.,]/g, '')])
    const length = duration(file)
    parts.push({ file })
    words.push({ text: word, start: Number(at.toFixed(3)), end: Number((at + length).toFixed(3)) })
    at += length
    parts.push({ silence: 0.05 })
    at += 0.05
  }
}

// Every piece as 48 kHz mono, then joined.
const list = []
parts.forEach((part, i) => {
  const file = join(work, `p${String(i).padStart(4, '0')}.wav`)
  const input = part.file ? ['-i', part.file] : ['-f', 'lavfi', '-t', String(part.silence), '-i', 'anullsrc=r=48000:cl=mono']
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', file])
  list.push(`file '${file.split('/').pop()}'`)
})
writeFileSync(join(work, 'list.txt'), list.join('\n'))
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'), '-c:a', 'pcm_s16le', join(out, 'voice.wav')])
const total = duration(join(out, 'voice.wav'))
// A little room noise, so the sound step has something to clean.
execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', `gradients=s=1280x720:r=30:c0=0x1b2a6b:c1=0x7a3ea8:c2=0x0f766e:speed=0.02:d=${total}`,
  '-i', join(out, 'voice.wav'),
  '-f', 'lavfi', '-i', `anoisesrc=c=brown:a=0.02:r=48000:d=${total}`,
  '-filter_complex', '[1:a][2:a]amix=inputs=2:normalize=0,pan=stereo|c0=c0|c1=c0[a]',
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest',
  join(out, 'sample-recording.mp4'),
])
writeFileSync(join(out, 'sample-transcript.json'), `${JSON.stringify({ language: 'en', words }, null, 1)}\n`)
rmSync(work, { recursive: true, force: true })
console.log(`${join(out, 'sample-recording.mp4')} (${total.toFixed(1)} s) and ${join(out, 'sample-transcript.json')} (${words.length} words)`)
