/**
 * The archive a new install starts with: the mockup's four albums and their counts (4,281 photographs in all), the twelve named frames its grid
 * shows, and a deterministic back catalogue so the counts, the storage bar and the smart collections are real rather than labels.
 */
import type { Album, ArtStyle, GalleryState, Photo } from './domain.ts'
import { stampOf } from './domain.ts'

interface AlbumSeed {
  readonly key: string
  readonly name: string
  readonly description: string
  readonly count: number
  readonly art: ArtStyle
}

const ALBUMS: readonly AlbumSeed[] = [
  { key: 'landscapes', name: 'Landscapes', description: 'Hills, coast and weather.', count: 842, art: 'landscape' },
  { key: 'architecture', name: 'Architecture', description: 'Concrete, glass and lines.', count: 516, art: 'architecture' },
  { key: 'portraits', name: 'Portraits', description: 'People in available light.', count: 317, art: 'portrait' },
  { key: 'travel', name: 'Travel', description: 'Places worth the walk.', count: 1_104, art: 'travel' },
]

/** 4,281 total: the four albums hold 2,779, the rest are imports that are not filed in an album yet. */
const TOTAL = 4_281
const UNFILED = TOTAL - ALBUMS.reduce((sum, album) => sum + album.count, 0)

/** The twelve frames the mockup's first grid shows, newest first, with the mockup's heights at 900px wide. */
interface NamedSeed {
  readonly title: string
  readonly album: string
  readonly art: ArtStyle
  readonly height: number
  readonly tags: readonly string[]
  readonly description: string
  readonly favourite?: boolean
  readonly shared?: boolean
}

const NAMED: readonly NamedSeed[] = [
  { title: 'Alpine quiet', album: 'landscapes', art: 'landscape', height: 670, tags: ['alpine', 'morning'], description: 'First light on the north ridge, before the valley wakes.' },
  { title: 'Morning coast', album: 'travel', art: 'travel', height: 470, tags: ['coast', 'morning'], description: 'The tide out and the harbour still asleep.' },
  { title: 'Lines of home', album: 'architecture', art: 'architecture', height: 610, tags: ['facade', 'lines'], description: 'A quiet facade repeating itself down the street.' },
  { title: 'The long road', album: 'landscapes', art: 'landscape', height: 440, tags: ['road', 'field'], description: 'The road out of town, empty for once.' },
  { title: 'Soft portrait', album: 'portraits', art: 'portrait', height: 560, tags: ['studio', 'window light'], description: 'A portrait made in the last of the window light.', favourite: true },
  { title: 'Desert forms', album: 'travel', art: 'travel', height: 690, tags: ['desert', 'dunes'], description: 'Wind-cut dunes under a pale sky.' },
  { title: 'City geometry', album: 'architecture', art: 'architecture', height: 480, tags: ['city', 'geometry'], description: 'Glass and repetition on the east side.' },
  { title: 'Blue hour', album: 'landscapes', art: 'landscape', height: 610, tags: ['blue hour', 'coast'], description: 'The ten minutes after sunset when everything turns blue.', favourite: true, shared: true },
  { title: 'Still life', album: 'portraits', art: 'portrait', height: 390, tags: ['still life', 'studio'], description: 'A table, one lamp and the afternoon.' },
  { title: 'Mountain pass', album: 'travel', art: 'travel', height: 720, tags: ['mountains', 'pass'], description: 'The pass in October, snow already on the far side.' },
  { title: 'Quiet facade', album: 'architecture', art: 'architecture', height: 540, tags: ['facade', 'shadow'], description: 'One wall, one shadow, one hour of the day.' },
  { title: 'Golden field', album: 'landscapes', art: 'landscape', height: 460, tags: ['field', 'summer'], description: 'A field left uncut until the light went.', favourite: true },
]

const TITLES: Record<string, readonly string[]> = {
  landscapes: ['Ridge light', 'Fog bank', 'River bend', 'North field', 'Cloud line', 'Long valley', 'First frost', 'Low sun', 'High meadow', 'Storm pass'],
  architecture: ['Grey stair', 'Window grid', 'Atrium', 'Concrete corner', 'Glass wall', 'Service lift', 'Rooflight', 'Brick rhythm', 'Underpass', 'Balcony row'],
  portraits: ['Studio study', 'Window seat', 'Half turn', 'Available light', 'Profile', 'Backlit', 'Quiet hands', 'Second frame', 'Low key', 'After hours'],
  travel: ['Harbour wall', 'Night train', 'Market lane', 'Old station', 'Ferry deck', 'Mountain hut', 'Coast road', 'City steps', 'Small square', 'Last boat'],
  unfiled: ['Archive frame', 'Untitled import', 'Bulk scan', 'Contact sheet', 'Plate study'],
}

const TAGS: Record<string, readonly string[]> = {
  landscapes: ['coast', 'field', 'ridge', 'weather', 'dusk', 'summer', 'frost'],
  architecture: ['concrete', 'glass', 'stairs', 'lines', 'shadow', 'facade', 'city'],
  portraits: ['studio', 'window light', 'profile', 'backlit', 'hands', 'portrait'],
  travel: ['harbour', 'boats', 'station', 'market', 'mountains', 'street', 'night'],
  unfiled: ['import', 'scan', 'archive', 'unsorted'],
}

const DESCRIPTIONS: Record<string, readonly string[]> = {
  landscapes: ['Weather moving across the valley.', 'A field left uncut.', 'Low cloud over the ridge.', 'The last light on the water.', 'A path that stops at the top.'],
  architecture: ['A stairwell in the old print works.', 'Glass and repetition.', 'The atrium, looking up.', 'A wall that keeps the afternoon.', 'Lines doing the work.'],
  portraits: ['A quiet portrait in window light.', 'A second frame from the same sitting.', 'A half turn toward the window.', 'Available light, no fill.', 'One lamp and a long exposure.'],
  travel: ['Boats waiting for the tide.', 'Morning market, before the crowd.', 'The last train under the clock.', 'A narrow street after rain.', 'A ferry deck in October.'],
  unfiled: ['An import waiting for an album.', 'A scan from the contact sheet.', 'A frame from the bulk import.', 'Not filed yet.', 'A plate kept for reference.'],
}

const STYLES: readonly ArtStyle[] = ['landscape', 'architecture', 'portrait', 'travel']

const TARGET_STORAGE_BYTES = 32_100_000_000

/** A small seeded generator (mulberry32), so the back catalogue is the same on every machine. */
function generator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

const DAY = 86_400_000

export function seed(now: Date, newId: (kind: string) => string): GalleryState {
  const albums: Album[] = ALBUMS.map((album) => ({ id: newId('album'), name: album.name, description: album.description }))
  const byKey = new Map(ALBUMS.map((album, index) => [album.key, albums[index] as Album]))
  const photos: Photo[] = []
  const random = generator(20_261_106)

  const add = (photo: Omit<Photo, 'id'>, index: number): Photo => {
    const made: Photo = { id: newId('photo'), ...photo }
    photos.push(made)
    return made
  }

  // The twelve named frames: the newest twelve, so the first grid shows them.
  for (const [index, item] of NAMED.entries()) {
    const album = byKey.get(item.album) as Album
    const captured = now.getTime() - (index + 1) * 1.5 * DAY
    add(
      {
        filename: `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`,
        title: item.title,
        albumId: album.id,
        art: item.art,
        tone: (index * 3) % 8,
        width: 6_000,
        height: Math.round((6_000 * item.height) / 900),
        tile: item.height,
        sizeBytes: 7_200_000 + Math.round(random() * 500_000),
        capturedAt: stampOf(new Date(captured)),
        addedAt: stampOf(new Date(captured)),
        editedAt: stampOf(new Date(captured + Math.round(random() * 2 * DAY))),
        tags: item.tags,
        favourite: item.favourite === true,
        shared: item.shared === true,
        origin: 'archive',
        description: item.description,
      },
      index,
    )
  }

  // The back catalogue: each album filled to its mockup count, the rest unfiled imports.
  let generated = 0
  const fill = (key: string, target: number, art: ArtStyle | 'mixed'): void => {
    const albumId = key === 'unfiled' ? '' : (byKey.get(key) as Album).id
    const titles = TITLES[key] as readonly string[]
    const tags = TAGS[key] as readonly string[]
    const descriptions = DESCRIPTIONS[key] as readonly string[]
    const named = key === 'unfiled' ? 0 : NAMED.filter((item) => item.album === key).length
    for (let index = 0; index < target - named; index += 1) {
      generated += 1
      const captured = now.getTime() - (30 + generated * 0.25) * DAY - Math.round(random() * 6) * 3_600_000
      const uploaded = random() < 0.02
      const added = uploaded ? now.getTime() - Math.round(random() * 30 * DAY) : now.getTime() - Math.round(random() * 800 * DAY)
      const edited = added + Math.round(random() * Math.max(3_600_000, now.getTime() - added) * 0.4)
      const style = art === 'mixed' ? (STYLES[Math.floor(random() * STYLES.length)] as ArtStyle) : art
      const base = titles[generated % titles.length] as string
      const tagA = tags[Math.floor(random() * tags.length)] as string
      const tagB = tags[Math.floor(random() * tags.length)] as string
      const prefix = key === 'landscapes' ? 'landscape' : key === 'architecture' ? 'architecture' : key === 'portraits' ? 'portrait' : key === 'travel' ? 'travel' : 'archive'
      add(
        {
          filename: `${prefix}-${String(generated).padStart(4, '0')}.jpg`,
          title: `${base} ${String(generated)}`,
          albumId,
          art: style,
          tone: Math.floor(random() * 8),
          width: 6_000,
          height: Math.round(6_000 * (0.43 + random() * 0.37)),
          tile: 390 + Math.floor(random() * 330),
          sizeBytes: 7_300_000 + Math.floor(random() * 400_000),
          capturedAt: stampOf(new Date(captured)),
          addedAt: stampOf(new Date(Math.min(now.getTime(), added))),
          editedAt: stampOf(new Date(Math.min(now.getTime(), edited))),
          tags: [...new Set([tagA, tagB])],
          favourite: random() < 0.045,
          shared: random() < 0.018,
          origin: uploaded ? 'upload' : 'archive',
          description: descriptions[generated % descriptions.length] as string,
        },
        generated,
      )
    }
  }

  for (const album of ALBUMS) fill(album.key, album.count, album.art)
  fill('unfiled', UNFILED, 'mixed')

  // The storage line is the sum of the files; tune the last import so the bar reads the mockup's 32.1 GB of 50 GB.
  const sum = photos.reduce((total, photo) => total + photo.sizeBytes, 0)
  const last = photos[photos.length - 1] as Photo
  photos[photos.length - 1] = { ...last, sizeBytes: Math.max(1, last.sizeBytes + TARGET_STORAGE_BYTES - sum) }

  for (const album of albums) {
    const cover = photos.find((photo) => photo.albumId === album.id)
    if (cover !== undefined) (album as { coverPhotoId?: string }).coverPhotoId = cover.id
  }

  return { version: 1, albums, photos }
}

/** What a fresh archive holds, for the README and the tests. */
export const SEED_FACTS = { albums: ALBUMS.length, total: TOTAL, unfiled: UNFILED, named: NAMED.length, storageBytes: TARGET_STORAGE_BYTES } as const
