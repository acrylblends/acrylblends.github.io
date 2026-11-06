/**
 * Offline reference imagery: each image asset is drawn from its style and palette as an SVG data URI. The demo needs no stock service, and the drawings
 * still read as material studies, calm geometry, window light and woven fabric on the canvas.
 */
import type { ArtStyle, Asset } from './domain.ts'

interface Palette {
  readonly paper: string
  readonly top: string
  readonly mid: string
  readonly dark: string
  readonly accent: string
}

const PALETTES: readonly Palette[] = [
  { paper: '#f4f0e6', top: '#d9d2c1', mid: '#b9aa8b', dark: '#6f6a58', accent: '#b96e4c' },
  { paper: '#f1efe8', top: '#cfd6cb', mid: '#8fa394', dark: '#3f5b4c', accent: '#c9a87c' },
  { paper: '#f6efe9', top: '#e4cbb8', mid: '#c79a7a', dark: '#7c5341', accent: '#a8492f' },
  { paper: '#eef0ea', top: '#c9cfc4', mid: '#9aa79a', dark: '#4e5a50', accent: '#d2b483' },
]

function hash(text: string): number {
  let value = 2_166_136_261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16_777_619)
  }
  return value >>> 0
}

function fraction(seed: number, salt: number): number {
  const mixed = Math.imul(seed ^ Math.imul(salt + 1, 2_654_435_761), 2_246_822_519) >>> 0
  return mixed / 4_294_967_296
}

function material(p: Palette, seed: number): string {
  const a = 80 + fraction(seed, 1) * 180
  const b = 240 + fraction(seed, 2) * 140
  return `
<rect width="600" height="400" fill="url(#paper)"/>
<path d="M-20 ${String(Math.round(170 + a * 0.4))} Q${String(Math.round(a))} ${String(Math.round(70 + b * 0.2))} ${String(Math.round(280 + b))} ${String(Math.round(180))} T620 ${String(Math.round(150 + a * 0.3))} V420 H-20 Z" fill="${p.top}"/>
<path d="M-20 ${String(Math.round(250 + b * 0.15))} Q${String(Math.round(180 + a * 0.3))} ${String(Math.round(150 + a * 0.3))} ${String(Math.round(360 + b * 0.4))} ${String(Math.round(260))} T620 ${String(Math.round(240))} V420 H-20 Z" fill="${p.mid}" opacity=".85"/>
<ellipse cx="${String(Math.round(160 + a))}" cy="${String(Math.round(300 - b * 0.05))}" rx="120" ry="46" fill="${p.dark}" opacity=".25"/>
<g stroke="${p.dark}" stroke-width="1.4" opacity=".18">
<path d="M20 60H580M20 90H580M20 120H580M20 150H580M20 180H580M20 210H580M20 240H580M20 270H580M20 300H580M20 330H580M20 360H580"/>
</g>
<circle cx="${String(Math.round(430 - a * 0.4))}" cy="${String(Math.round(90 + a * 0.2))}" r="52" fill="${p.accent}" opacity=".55"/>`.trim()
}

function architecture(p: Palette, seed: number): string {
  const arch = 150 + fraction(seed, 1) * 160
  return `
<rect width="600" height="400" fill="url(#paper)"/>
<rect x="0" y="0" width="600" height="400" fill="${p.top}" opacity=".35"/>
<rect x="70" y="70" width="190" height="330" fill="${p.mid}"/>
<path d="M70 150 Q165 40 260 150 V400 H70 Z" fill="${p.paper}"/>
<path d="M95 165 Q165 85 235 165 V400 H95 Z" fill="${p.dark}" opacity=".22"/>
<rect x="300" y="130" width="230" height="270" fill="${p.dark}" opacity=".32"/>
<rect x="330" y="165" width="170" height="90" fill="${p.paper}" opacity=".8"/>
<rect x="330" y="280" width="170" height="12" fill="${p.accent}" opacity=".55"/>
<rect x="0" y="392" width="600" height="8" fill="${p.dark}" opacity=".25"/>
<circle cx="${String(Math.round(430 + arch * 0.2))}" cy="${String(Math.round(60 + arch * 0.1))}" r="26" fill="${p.accent}" opacity=".5"/>`.trim()
}

function light(p: Palette, seed: number): string {
  const shift = fraction(seed, 1) * 120
  return `
<rect width="600" height="400" fill="url(#paper)"/>
<rect x="0" y="0" width="600" height="400" fill="${p.top}" opacity=".45"/>
<path d="M${String(Math.round(120 + shift))} 0 L${String(Math.round(360 + shift))} 0 L${String(Math.round(470 + shift))} 400 L${String(Math.round(210 + shift))} 400 Z" fill="${p.paper}" opacity=".9"/>
<path d="M${String(Math.round(200 + shift))} 0 L${String(Math.round(300 + shift))} 0 L${String(Math.round(392 + shift))} 400 L${String(Math.round(286 + shift))} 400 Z" fill="#ffffff" opacity=".55"/>
<rect x="0" y="330" width="600" height="70" fill="${p.mid}" opacity=".4"/>
<ellipse cx="${String(Math.round(180 + shift))}" cy="352" rx="90" ry="16" fill="${p.dark}" opacity=".12"/>`.trim()
}

function fabric(p: Palette, seed: number): string {
  const fold = 100 + fraction(seed, 1) * 160
  return `
<rect width="600" height="400" fill="url(#paper)"/>
<rect width="600" height="400" fill="${p.top}" opacity=".5"/>
<path d="M0 ${String(Math.round(120 + fold * 0.3))} Q160 ${String(Math.round(60 + fold * 0.2))} 320 ${String(Math.round(150 + fold * 0.25))} T600 ${String(Math.round(110 + fold * 0.3))} V400 H0 Z" fill="${p.mid}" opacity=".7"/>
<path d="M0 ${String(Math.round(230 + fold * 0.2))} Q220 ${String(Math.round(160 + fold * 0.15))} 420 ${String(Math.round(250 + fold * 0.1))} T600 ${String(Math.round(220))} V400 H0 Z" fill="${p.dark}" opacity=".38"/>
<g stroke="${p.paper}" stroke-width="1" opacity=".35">
${Array.from({ length: 16 }, (_, index) => `<path d="M${String(index * 40)} 0 V400"/>`).join('')}
</g>
<g stroke="${p.dark}" stroke-width="1" opacity=".12">
${Array.from({ length: 10 }, (_, index) => `<path d="M0 ${String(index * 44)} H600"/>`).join('')}
</g>`.trim()
}

export function artOf(asset: Pick<Asset, 'art' | 'tone' | 'id'>): string {
  const palette = PALETTES[asset.tone % PALETTES.length] as Palette
  const seed = hash(asset.id)
  const styles: Record<ArtStyle, (p: Palette, s: number) => string> = { material, architecture, light, fabric }
  const body = styles[asset.art](palette, seed)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.paper}"/><stop offset="1" stop-color="${palette.top}"/></linearGradient></defs>
${body}
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n/g, ''))}`
}
