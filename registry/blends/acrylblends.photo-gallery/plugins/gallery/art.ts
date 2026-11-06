/**
 * Offline artwork: every photograph is drawn as a small SVG from its style, palette and id, and returned as a data URI. The demo never fetches an
 * image (the spec allows remote samples, but a blueprint must work with no network), and the drawings still read as pictures at grid and lightbox size.
 */
import type { ArtStyle, Photo } from './domain.ts'

interface Palette {
  readonly sky0: string
  readonly sky1: string
  readonly sun: string
  readonly far: string
  readonly mid: string
  readonly near: string
  readonly ground: string
  readonly accent: string
}

const PALETTES: readonly Palette[] = [
  { sky0: '#243849', sky1: '#9db4b8', sun: '#f0d4a8', far: '#4d6367', mid: '#364b50', near: '#26363b', ground: '#1d2b30', accent: '#e6c79a' },
  { sky0: '#c3d2d1', sky1: '#f2eadb', sun: '#f6d79f', far: '#8fa096', mid: '#667a6e', near: '#435449', ground: '#33433a', accent: '#f3e3bd' },
  { sky0: '#d9b18a', sky1: '#f6e7cd', sun: '#f8d58f', far: '#c08a62', mid: '#9a6448', near: '#764a36', ground: '#573528', accent: '#f0c98f' },
  { sky0: '#1f2f47', sky1: '#7288a8', sun: '#ece6d3', far: '#3d506a', mid: '#2c3b52', near: '#1e2a3b', ground: '#141d2a', accent: '#e8ddc2' },
  { sky0: '#8fa892', sky1: '#e9e4cc', sun: '#f2dfae', far: '#6b876d', mid: '#506a55', near: '#3a5040', ground: '#2a3c30', accent: '#efe0b8' },
  { sky0: '#93a2ae', sky1: '#dde1e4', sun: '#f1eee5', far: '#78838f', mid: '#5a646f', near: '#424b55', ground: '#30373f', accent: '#e9e3d6' },
  { sky0: '#6f5043', sky1: '#d8b8a4', sun: '#f1d5b3', far: '#8a6450', mid: '#654639', near: '#46302a', ground: '#2f211d', accent: '#f2d9b8' },
  { sky0: '#14202e', sky1: '#31485e', sun: '#efe0b6', far: '#2a3d51', mid: '#203142', near: '#16222f', ground: '#0e1721', accent: '#e9d8ac' },
]

/** A small deterministic hash, so a photograph's drawing never changes between renders or machines. */
function hash(text: string): number {
  let value = 2_166_136_261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16_777_619)
  }
  return value >>> 0
}

/** A deterministic 0 to 1 fraction from a hash and a salt. */
function fraction(seed: number, salt: number): number {
  const mixed = Math.imul(seed ^ Math.imul(salt + 1, 2_654_435_761), 2_246_822_519) >>> 0
  return mixed / 4_294_967_296
}

function landscape(p: Palette, height: number, seed: number): string {
  const horizon = height * (0.56 + fraction(seed, 1) * 0.08)
  const sunX = 130 + fraction(seed, 2) * 640
  const sunY = height * (0.16 + fraction(seed, 3) * 0.14)
  const sunR = Math.max(24, height * 0.045)
  const peaks = (base: number, amplitude: number, salt: number): string => {
    const points: string[] = [`M0 ${String(Math.round(base))}`]
    for (let index = 1; index <= 7; index += 1) {
      const x = (900 / 7) * index
      const y = base - amplitude * (0.25 + fraction(seed, salt + index) * 0.75)
      points.push(`L${String(Math.round(x))} ${String(Math.round(y))}`)
    }
    points.push(`L900 ${String(height)}`, 'L0 ' + String(height), 'Z')
    return points.join(' ')
  }
  return `
<rect width="900" height="${String(height)}" fill="url(#sky)"/>
<circle cx="${String(Math.round(sunX))}" cy="${String(Math.round(sunY))}" r="${String(Math.round(sunR))}" fill="${p.sun}" opacity=".92"/>
<rect y="${String(Math.round(horizon - height * 0.16))}" width="900" height="${String(Math.round(height * 0.16))}" fill="${p.sky1}" opacity=".35"/>
<path d="${peaks(horizon, height * 0.3, 10)}" fill="${p.far}" opacity=".85"/>
<path d="${peaks(horizon + height * 0.1, height * 0.22, 30)}" fill="${p.mid}" opacity=".92"/>
<path d="${peaks(horizon + height * 0.22, height * 0.14, 50)}" fill="${p.near}"/>
<rect y="${String(Math.round(height * 0.9))}" width="900" height="${String(Math.round(height * 0.1))}" fill="${p.ground}"/>
<rect y="${String(Math.round(horizon - height * 0.02))}" width="900" height="${String(Math.round(height * 0.035))}" fill="#ffffff" opacity=".07"/>`.trim()
}

function architecture(p: Palette, height: number, seed: number): string {
  const base = height * 0.9
  const blocks: string[] = []
  let x = -40
  for (let index = 0; index < 6; index += 1) {
    const width = 120 + fraction(seed, index * 3 + 1) * 150
    const top = height * (0.18 + fraction(seed, index * 3 + 2) * 0.34)
    const fill = index % 3 === 0 ? p.near : index % 3 === 1 ? p.mid : p.far
    blocks.push(`<rect x="${String(Math.round(x))}" y="${String(Math.round(top))}" width="${String(Math.round(width))}" height="${String(Math.round(base - top))}" fill="${fill}" opacity=".96"/>`)
    blocks.push(`<rect x="${String(Math.round(x + width * 0.16))}" y="${String(Math.round(top + height * 0.04))}" width="${String(Math.round(width * 0.68))}" height="${String(Math.round(base - top - height * 0.07))}" fill="url(#windows)" opacity=".5"/>`)
    x += width - 14
  }
  const sunX = 160 + fraction(seed, 40) * 580
  return `
<rect width="900" height="${String(height)}" fill="url(#sky)"/>
<circle cx="${String(Math.round(sunX))}" cy="${String(Math.round(height * 0.2))}" r="${String(Math.round(Math.max(20, height * 0.04)))}" fill="${p.sun}" opacity=".75"/>
${blocks.join('\n')}
<rect y="${String(Math.round(base))}" width="900" height="${String(Math.round(height - base))}" fill="${p.ground}"/>
<path d="M0 ${String(Math.round(base))} L900 ${String(Math.round(base))} L760 ${String(height)} L140 ${String(height)} Z" fill="${p.near}" opacity=".55"/>`.trim()
}

function portrait(p: Palette, height: number, seed: number): string {
  const centre = 360 + fraction(seed, 1) * 180
  const headRadius = Math.min(height * 0.21, 190)
  const headY = height * (0.34 + fraction(seed, 2) * 0.06)
  return `
<rect width="900" height="${String(height)}" fill="url(#sky)"/>
<rect width="900" height="${String(height)}" fill="${p.sky0}" opacity=".12"/>
<ellipse cx="${String(Math.round(centre))}" cy="${String(Math.round(height * 1.12))}" rx="${String(Math.round(headRadius * 1.75))}" ry="${String(Math.round(height * 0.5))}" fill="${p.near}"/>
<circle cx="${String(Math.round(centre))}" cy="${String(Math.round(headY))}" r="${String(Math.round(headRadius))}" fill="${p.mid}"/>
<path d="M${String(Math.round(centre - headRadius * 0.92))} ${String(Math.round(headY - headRadius * 0.3))} Q${String(Math.round(centre - headRadius * 1.02))} ${String(Math.round(headY - headRadius * 1.15))} ${String(Math.round(centre + headRadius * 0.1))} ${String(Math.round(headY - headRadius * 1.05))}" fill="none" stroke="${p.accent}" stroke-width="${String(Math.max(6, headRadius * 0.08))}" opacity=".55"/>
<ellipse cx="${String(Math.round(centre + headRadius * 0.2))}" cy="${String(Math.round(headY + headRadius * 1.9))}" rx="${String(Math.round(headRadius * 0.5))}" ry="${String(Math.round(headRadius * 0.3))}" fill="${p.accent}" opacity=".08"/>
<rect y="${String(Math.round(height * 0.62))}" width="900" height="${String(Math.round(height * 0.38))}" fill="${p.ground}" opacity=".25"/>`.trim()
}

function travel(p: Palette, height: number, seed: number): string {
  const seaY = height * 0.58
  const boatX = 180 + fraction(seed, 1) * 540
  const sail = 40 + fraction(seed, 2) * 36
  return `
<rect width="900" height="${String(height)}" fill="url(#sky)"/>
<circle cx="${String(Math.round(200 + fraction(seed, 3) * 500))}" cy="${String(Math.round(height * 0.22))}" r="${String(Math.round(Math.max(26, height * 0.05)))}" fill="${p.sun}" opacity=".88"/>
<path d="M0 ${String(Math.round(seaY - height * 0.03))} Q220 ${String(Math.round(seaY - height * 0.07))} 430 ${String(Math.round(seaY - height * 0.02))} T900 ${String(Math.round(seaY - height * 0.04))} L900 ${String(height)} L0 ${String(height)} Z" fill="${p.mid}"/>
<path d="M0 ${String(Math.round(seaY + height * 0.13))} Q300 ${String(Math.round(seaY + height * 0.1))} 620 ${String(Math.round(seaY + height * 0.14))} T900 ${String(Math.round(seaY + height * 0.12))} L900 ${String(height)} L0 ${String(height)} Z" fill="${p.near}"/>
<g opacity=".16" stroke="${p.accent}" stroke-width="2">
<path d="M60 ${String(Math.round(seaY + height * 0.05))} H840"/>
<path d="M120 ${String(Math.round(seaY + height * 0.09))} H780"/>
<path d="M40 ${String(Math.round(seaY + height * 0.2))} H860"/>
</g>
<g transform="translate(${String(Math.round(boatX))} ${String(Math.round(seaY + height * 0.02))})">
<path d="M-${String(Math.round(sail))} 0 L${String(Math.round(sail))} 0 L${String(Math.round(sail * 0.55))} ${String(Math.round(sail * 0.28))} L-${String(Math.round(sail * 0.55))} ${String(Math.round(sail * 0.28))} Z" fill="${p.ground}"/>
<path d="M0 -4 L0 -${String(Math.round(sail * 1.5))} L${String(Math.round(sail * 0.9))} -${String(Math.round(sail * 0.3))} Z" fill="${p.accent}" opacity=".9"/>
<path d="M0 -4 L0 -${String(Math.round(sail * 1.2))} L-${String(Math.round(sail * 0.75))} -${String(Math.round(sail * 0.3))} Z" fill="${p.far}"/>
</g>
<rect y="${String(Math.round(height * 0.9))}" width="900" height="${String(Math.round(height * 0.1))}" fill="${p.ground}" opacity=".5"/>`.trim()
}

/** The data URI of a photograph's generated artwork, drawn at its true aspect ratio or at a tile's display height (the grid's crop). */
export function artOf(photo: Pick<Photo, 'art' | 'tone' | 'width' | 'height' | 'id'>, boxHeight?: number): string {
  const palette = PALETTES[photo.tone % PALETTES.length] as Palette
  const height =
    boxHeight === undefined
      ? Math.max(320, Math.min(1_600, Math.round((900 * photo.height) / Math.max(1, photo.width))))
      : Math.max(320, Math.min(2_400, Math.round((900 * boxHeight) / 275)))
  const seed = hash(photo.id)
  const style: Record<ArtStyle, (p: Palette, h: number, s: number) => string> = {
    landscape,
    architecture,
    portrait,
    travel,
  }
  const body = style[photo.art](palette, height, seed)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 ${String(height)}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${palette.sky0}"/><stop offset="1" stop-color="${palette.sky1}"/></linearGradient>
<radialGradient id="vignette" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".28"/></radialGradient>
<pattern id="windows" width="26" height="34" patternUnits="userSpaceOnUse"><rect x="5" y="7" width="10" height="14" fill="${palette.accent}"/></pattern>
</defs>
${body}
<rect width="900" height="${String(height)}" fill="url(#vignette)"/>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n/g, ''))}`
}

/** A tiny avatar-like drawing for an album cover: the first photograph's style, cropped square. */
export function coverOf(photo: Pick<Photo, 'art' | 'tone' | 'id'>): string {
  return artOf({ ...photo, width: 1, height: 1 })
}
