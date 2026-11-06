/** The project a person sees on the first start: Spring Campaign with four documents (Hero poster as in the mockup), the Select tool, 100% zoom and an empty activity log. */
import type { Doc, Layer, ProjectState } from './domain.ts'

const layer = (l: Partial<Layer> & Pick<Layer, 'id' | 'name' | 'kind' | 'x' | 'y' | 'w' | 'h' | 'fill'>): Layer => ({ opacity: 100, radius: 0, visible: true, ...l })

const heroPoster: Doc = {
  id: 'hero-poster',
  name: 'Hero poster',
  file: 'hero-poster.canvas',
  layers: [
    layer({ id: 'artboard', name: 'Artboard', kind: 'artboard', x: 0, y: 0, w: 1440, h: 980, fill: '#e8dfd3', radius: 3 }),
    layer({ id: 'headline', name: 'Headline', kind: 'text', x: 90, y: 150, w: 740, h: 330, fill: '#1d292c', text: 'A quieter\nkind of bold.', fontSize: 106, serif: true }),
    layer({ id: 'hero-image', name: 'Hero image', kind: 'image', x: 800, y: 420, w: 560, h: 470, fill: '#647c72', radius: 180, text: 'form / 01' }),
    layer({ id: 'cta', name: 'CTA button', kind: 'button', x: 90, y: 700, w: 340, h: 78, fill: '#253c36', text: 'Explore collection ↗', fontSize: 22 }),
    layer({ id: 'eyebrow', name: 'Eyebrow', kind: 'text', x: 90, y: 92, w: 620, h: 32, fill: '#637b74', text: 'OBJECTS IN BLOOM · 2025', fontSize: 20 }),
    layer({ id: 'copy', name: 'Body copy', kind: 'text', x: 90, y: 500, w: 620, h: 170, fill: '#55615e', text: 'A considered collection for spaces that leave room to breathe. Made slowly, and made to last.', fontSize: 26 }),
  ],
}

const socialCard: Doc = {
  id: 'social-card',
  name: 'Social card',
  file: 'social-card.canvas',
  layers: [
    layer({ id: 'artboard', name: 'Artboard', kind: 'artboard', x: 0, y: 0, w: 1080, h: 1080, fill: '#d9e2dc' }),
    layer({ id: 'headline', name: 'Headline', kind: 'text', x: 80, y: 280, w: 920, h: 400, fill: '#1d292c', text: 'Small rituals.\nBig feeling.', fontSize: 120, serif: true }),
    layer({ id: 'badge', name: 'Badge', kind: 'shape', x: 80, y: 80, w: 220, h: 64, fill: '#253c36', radius: 32 }),
    layer({ id: 'cta', name: 'CTA button', kind: 'button', x: 80, y: 820, w: 360, h: 84, fill: '#253c36', text: 'Shop the spring edit', fontSize: 24 }),
  ],
}

const brandMarks: Doc = {
  id: 'brand-marks',
  name: 'Brand marks',
  file: 'brand-marks.canvas',
  layers: [
    layer({ id: 'artboard', name: 'Artboard', kind: 'artboard', x: 0, y: 0, w: 800, h: 600, fill: '#f1ece3' }),
    layer({ id: 'wordmark', name: 'Wordmark', kind: 'text', x: 80, y: 220, w: 640, h: 160, fill: '#253c36', text: 'Objects in bloom.', fontSize: 72, serif: true }),
    layer({ id: 'mark', name: 'Mark', kind: 'shape', x: 80, y: 80, w: 90, h: 90, fill: '#c08a4e', radius: 45 }),
  ],
}

const typography: Doc = {
  id: 'typography',
  name: 'Typography',
  file: 'typography.canvas',
  layers: [
    layer({ id: 'artboard', name: 'Artboard', kind: 'artboard', x: 0, y: 0, w: 1200, h: 800, fill: '#ffffff' }),
    layer({ id: 'display', name: 'Display', kind: 'text', x: 80, y: 80, w: 1000, h: 200, fill: '#1d292c', text: 'Aa — Georgia 96', fontSize: 96, serif: true }),
    layer({ id: 'body', name: 'Body', kind: 'text', x: 80, y: 340, w: 800, h: 120, fill: '#55615e', text: 'Inter 24 — The quick brown fox jumps over the lazy dog.', fontSize: 24 }),
  ],
}

export function seed(): ProjectState {
  return { version: 1, name: 'Spring Campaign', docs: [heroPoster, socialCard, brandMarks, typography], exports: [], activity: [], view: { zoom: 100, showLayers: true, tool: 'select' } }
}
