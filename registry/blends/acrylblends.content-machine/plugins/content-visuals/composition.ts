/**
 * The finished video as a HyperFrames composition: the cut (with its sound) as the base, then what is drawn over it, each timed on the cut's timeline:
 * captions in one of three styles, a title card over the first seconds, pictures and clips from the library (b-roll), punch-in zooms where a new
 * sentence starts, and a progress bar. Pure: it returns the HTML, the caller writes the folder and renders it.
 */
import { type Brand, type CaptionStyle, type Cue, html, type Overlay, type Segment } from '../content/index.ts'

export interface FinalInput {
  readonly width: number
  readonly height: number
  readonly duration: number
  /** The base video's file in the composition folder. */
  readonly video: string
  readonly cues: readonly Cue[]
  readonly captions: { readonly enabled: boolean; readonly style: CaptionStyle }
  readonly title: string
  readonly subtitle: string
  readonly brand: Pick<Brand, 'color' | 'name'>
  readonly overlays: readonly (Overlay & { readonly src: string })[]
  readonly punchIns: readonly number[]
  readonly progressBar: boolean
  /** For a vertical short: the base is fitted into the middle over a blurred copy of itself. */
  readonly vertical?: boolean
}

const n = (x: number) => Number(x.toFixed(3))

/** Punch-ins: every other line start (at least 4 s apart), so the picture changes size with the thought. */
export function punchInTimes(segments: readonly Segment[], gap = 4): number[] {
  const out: number[] = []
  for (const s of segments) if (s.start > 0.5 && (out.length === 0 || s.start - out.at(-1)! >= gap)) out.push(s.start)
  return out
}

export function finalHtml(input: FinalInput): string {
  const { width: W, height: H, duration: D } = input
  const portrait = H > W
  const capSize = Math.round((portrait ? W * 0.075 : H * 0.058) * (input.captions.style === 'minimal' ? 0.7 : 1))
  const accent = input.brand.color
  const cues = input.captions.enabled ? input.cues : []
  const elements: string[] = []
  const script: string[] = []

  if (input.vertical) {
    elements.push(`<video id="bg" class="clip" src="${html(input.video)}" muted data-start="0" data-duration="${n(D)}" data-track-index="0"></video>`)
  }
  elements.push(`<div id="cam"><video id="base" class="clip" src="${html(input.video)}" data-start="0" data-duration="${n(D)}" data-track-index="1"></video></div>`)

  input.overlays.forEach((o, i) => {
    const media = o.kind === 'image' ? `<img src="${html(o.src)}" alt="">` : `<video src="${html(o.src)}" muted></video>`
    elements.push(`<div id="ov${i}" class="clip overlay" data-start="${n(o.at)}" data-duration="${n(o.duration)}" data-track-index="2">${media}</div>`)
    if (o.kind === 'image') script.push(`tl.fromTo('#ov${i} img',{scale:1.0},{scale:1.12,duration:${n(o.duration)},ease:'none'},${n(o.at)});`)
    script.push(`tl.fromTo('#ov${i}',{opacity:0},{opacity:1,duration:0.3},${n(o.at)});`)
  })

  cues.forEach((cue, i) => {
    const words = cue.words.map((w, j) => `<span class="w" id="c${i}w${j}">${html(w.text)}</span>`).join(' ')
    elements.push(`<div id="c${i}" class="clip cap cap-${input.captions.style}" data-start="${n(cue.start)}" data-duration="${n(Math.max(0.2, cue.end - cue.start))}" data-track-index="3"><div class="line">${words}</div></div>`)
    if (input.captions.style === 'karaoke') cue.words.forEach((w, j) => script.push(`tl.set('#c${i}w${j}',{color:'${accent}'},${n(w.start)});`))
    if (input.captions.style === 'bold') script.push(`tl.fromTo('#c${i} .line',{y:${Math.round(capSize * 0.25)},opacity:0},{y:0,opacity:1,duration:0.15},${n(cue.start)});`)
  })

  if (input.title.trim() !== '') {
    const length = Math.min(3.5, D)
    elements.push(`<div id="title" class="clip" data-start="0" data-duration="${n(length)}" data-track-index="4"><div class="bar"></div><h1>${html(input.title)}</h1>${input.subtitle.trim() === '' ? '' : `<p>${html(input.subtitle)}</p>`}</div>`)
    script.push(`tl.fromTo('#title h1',{x:-40,opacity:0},{x:0,opacity:1,duration:0.45,ease:'power3.out'},0.1);`)
    script.push(`tl.fromTo('#title .bar',{scaleX:0},{scaleX:1,duration:0.5,ease:'power3.out'},0);`)
    if (input.subtitle.trim() !== '') script.push(`tl.fromTo('#title p',{opacity:0},{opacity:1,duration:0.4},0.45);`)
    script.push(`tl.to('#title h1, #title p, #title .bar',{opacity:0,duration:0.35},${n(Math.max(0, length - 0.4))});`)
  }

  input.punchIns.forEach((at, i) => script.push(`tl.set('#cam',{scale:${i % 2 === 0 ? 1.08 : 1}},${n(at)});`))

  if (input.progressBar) {
    elements.push(`<div id="progress" class="clip" data-start="0" data-duration="${n(D)}" data-track-index="5"><div id="fill"></div></div>`)
    script.push(`tl.fromTo('#fill',{scaleX:0},{scaleX:1,duration:${n(D)},ease:'none'},0);`)
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
html,body{margin:0;background:#000}
#root{position:relative;width:100%;height:100%;overflow:hidden;background:#000;font-family:Inter,sans-serif}
#bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(40px) brightness(.55)}
#cam{position:absolute;inset:0;transform-origin:50% 45%}
#base{position:absolute;inset:0;width:100%;height:100%;object-fit:${input.vertical ? 'contain' : 'cover'}}
.overlay{position:absolute;inset:0;overflow:hidden;background:#000}
.overlay img,.overlay video{width:100%;height:100%;object-fit:cover}
.cap{position:absolute;left:6%;right:6%;bottom:${portrait ? '22%' : '9%'};text-align:center}
.cap .line{display:inline-block;font-weight:800;font-size:${capSize}px;line-height:1.18;color:#fff}
.cap-bold .line{background:rgba(0,0,0,.62);padding:${Math.round(capSize * 0.2)}px ${Math.round(capSize * 0.45)}px;border-radius:${Math.round(capSize * 0.3)}px}
.cap-karaoke .line{text-shadow:0 3px 0 #000,0 0 18px rgba(0,0,0,.8);text-transform:uppercase}
.cap-minimal .line{font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,.9)}
#title{position:absolute;left:7%;right:7%;top:${portrait ? '14%' : '30%'}}
#title .bar{width:${Math.round(W * 0.08)}px;height:${Math.max(6, Math.round(H * 0.01))}px;background:${accent};transform-origin:0 50%;margin-bottom:${Math.round(H * 0.025)}px}
#title h1{margin:0;font-weight:900;font-size:${Math.round((portrait ? W : H) * 0.085)}px;line-height:1.05;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.6)}
#title p{margin:${Math.round(H * 0.015)}px 0 0;font-weight:600;font-size:${Math.round((portrait ? W : H) * 0.038)}px;color:#e8e8ea;text-shadow:0 2px 16px rgba(0,0,0,.7)}
#progress{position:absolute;left:0;right:0;bottom:0;height:${Math.max(4, Math.round(H * 0.007))}px;background:rgba(255,255,255,.2)}
#fill{height:100%;background:${accent};transform-origin:0 50%}
</style></head><body>
<div id="root" data-composition-id="final" data-width="${W}" data-height="${H}" data-duration="${n(D)}">
${elements.join('\n')}
</div>
<script src="gsap.min.js"></script>
<script>const tl=gsap.timeline({paused:true});
${script.join('\n')}
window.__timelines["final"]=tl;</script>
</body></html>
`
}
