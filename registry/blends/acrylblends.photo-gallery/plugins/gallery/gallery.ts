/**
 * The archive service: albums, photographs, favourites, sharing, uploads and the smart-collection windows. It owns the state and calls the store; the
 * clock and the id maker are injected, so a test can pin both. Every outside effect goes through `GalleryAdapters`.
 */
import {
  albumCounts,
  cleanArt,
  cleanDescription,
  cleanFilename,
  cleanTags,
  cleanTitle,
  cleanTone,
  filterPhotos,
  GalleryError,
  neighbours,
  slugOf,
  stampOf,
  STORAGE_LIMIT_BYTES,
  type Album,
  type ArtStyle,
  type GalleryState,
  type Photo,
  type PhotoFilter,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface GalleryAdapters {
  readonly store: Store<GalleryState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface UploadInput {
  readonly filename: string
  readonly title: string
  readonly albumId: string
  readonly description: string
  readonly tags?: string
  readonly art?: string
  readonly tone?: string | number
  readonly width?: number
  readonly height?: number
}

export interface AlbumStats {
  readonly count: number
  readonly bytes: number
  readonly first?: string
  readonly last?: string
}

export class Gallery {
  private state: GalleryState
  private readonly adapters: GalleryAdapters

  private constructor(state: GalleryState, adapters: GalleryAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: GalleryAdapters): Promise<Gallery> {
    const saved = await adapters.store.load()
    return new Gallery(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get now(): Date {
    return this.adapters.clock()
  }

  albums(): readonly Album[] {
    return this.state.albums
  }

  album(id: string): Album | undefined {
    return this.state.albums.find((album) => album.id === id)
  }

  photos(filter: PhotoFilter = {}): Photo[] {
    return filterPhotos(this.state.photos, filter)
  }

  photo(id: string): Photo | undefined {
    return this.state.photos.find((photo) => photo.id === id)
  }

  counts(): Map<string, number> {
    return albumCounts(this.state.photos)
  }

  total(): number {
    return this.state.photos.length
  }

  favourites(): number {
    return this.state.photos.filter((photo) => photo.favourite).length
  }

  sharedCount(): number {
    return this.state.photos.filter((photo) => photo.shared).length
  }

  storageBytes(): number {
    return this.state.photos.reduce((sum, photo) => sum + photo.sizeBytes, 0)
  }

  storageLimit(): number {
    return STORAGE_LIMIT_BYTES
  }

  albumStats(albumId: string): AlbumStats {
    const photos = this.state.photos.filter((photo) => photo.albumId === albumId)
    const dates = photos.map((photo) => photo.capturedAt).sort()
    const first = dates[0]
    const last = dates[dates.length - 1]
    return {
      count: photos.length,
      bytes: photos.reduce((sum, photo) => sum + photo.sizeBytes, 0),
      ...(first === undefined ? {} : { first }),
      ...(last === undefined ? {} : { last }),
    }
  }

  /** The previous and next photograph in the library order the mockup's lightbox steps through. */
  pair(photo: Photo): { prev?: Photo; next?: Photo } {
    return neighbours(this.photos(), photo)
  }

  async toggleFavourite(id: string): Promise<Photo> {
    const photo = this.photo(id)
    if (photo === undefined) throw new GalleryError('not-found', 'That photograph no longer exists.')
    return this.replace({ ...photo, favourite: !photo.favourite })
  }

  async toggleShared(id: string): Promise<Photo> {
    const photo = this.photo(id)
    if (photo === undefined) throw new GalleryError('not-found', 'That photograph no longer exists.')
    return this.replace({ ...photo, shared: !photo.shared })
  }

  /** Add a photograph to an album (or to the unfiled imports with an empty album id) and persist it. */
  async upload(input: UploadInput): Promise<Photo> {
    const filename = cleanFilename(input.filename)
    const title = cleanTitle(input.title)
    const description = cleanDescription(input.description)
    const tags = cleanTags(input.tags)
    if (this.state.photos.some((photo) => photo.filename.toLowerCase() === filename.toLowerCase())) {
      throw new GalleryError('conflict', 'A photograph with that file name is already in the archive.')
    }
    let albumId = ''
    if (input.albumId !== '') {
      const album = this.album(input.albumId)
      if (album === undefined) throw new GalleryError('invalid', 'Choose an album that still exists.')
      albumId = album.id
    }
    const art: ArtStyle = cleanArt(input.art)
    const tone = cleanTone(input.tone)
    const now = stampOf(this.adapters.clock())
    const photo: Photo = {
      id: this.adapters.newId('photo'),
      filename,
      title,
      albumId,
      art,
      tone,
      width: input.width ?? 6_000,
      height: input.height ?? 4_000,
      tile: 440,
      sizeBytes: 6_000_000,
      capturedAt: now,
      addedAt: now,
      editedAt: now,
      tags,
      favourite: false,
      shared: false,
      origin: 'upload',
      description,
    }
    this.state.photos.unshift(photo)
    await this.save()
    return photo
  }

  /** Change the album of an unfiled import (kept small; the upload flow is the primary mutation). */
  async file(id: string, albumId: string): Promise<Photo> {
    const photo = this.photo(id)
    if (photo === undefined) throw new GalleryError('not-found', 'That photograph no longer exists.')
    const album = this.album(albumId)
    if (album === undefined) throw new GalleryError('invalid', 'That album no longer exists.')
    return this.replace({ ...photo, albumId: album.id, editedAt: stampOf(this.adapters.clock()) })
  }

  /** A filename the archive can suggest to the upload form. */
  suggestFilename(title: string): string {
    return `${slugOf(title) || 'frame'}.jpg`
  }

  private async replace(photo: Photo): Promise<Photo> {
    this.state.photos = this.state.photos.map((item) => (item.id === photo.id ? photo : item))
    await this.save()
    return photo
  }

  private async save(): Promise<void> {
    this.state = { ...this.state, albums: [...this.state.albums], photos: [...this.state.photos] }
    try {
      await this.adapters.store.save(this.state)
    } catch (error) {
      throw new GalleryError('storage', `The archive could not be saved: ${(error as Error).message}`)
    }
  }
}
