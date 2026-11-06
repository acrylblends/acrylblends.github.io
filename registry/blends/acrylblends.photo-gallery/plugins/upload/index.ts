/**
 * Upload: GET `/upload` is the add form, POST `/upload` validates and files a photograph. The artwork is drawn from the chosen style and palette, so the
 * demo needs no file picker, no object URLs and no network; a real app would store the original and a generated thumbnail behind the same boundary.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { artOf, ART_STYLES, type ArtStyle, GalleryError, type Gallery } from '../gallery/index.ts'
import { escapeHtml, pageHead, type Shell } from '../gallery-shell/index.ts'

export const name = 'upload'
export const inject = ['gallery', 'shell', 'router']

const PALETTES = ['Dusk', 'Alpine', 'Desert', 'Blue hour', 'Forest', 'Concrete', 'Amber', 'Night']

interface Values {
  readonly filename: string
  readonly title: string
  readonly albumId: string
  readonly description: string
  readonly tags: string
  readonly art: string
  readonly tone: string
}

const EMPTY: Values = { filename: '', title: '', albumId: '', description: '', tags: '', art: 'landscape', tone: '0' }

function valuesFrom(form: Record<string, unknown>, fallback: Values): Values {
  const text = (key: keyof Values): string => (typeof form[key] === 'string' ? (form[key] as string) : fallback[key])
  return {
    filename: text('filename'),
    title: text('title'),
    albumId: text('albumId'),
    description: text('description'),
    tags: text('tags'),
    art: text('art'),
    tone: text('tone'),
  }
}

export function apply(ctx: Context): void {
  const gallery: Gallery = ctx.gallery
  const shell: Shell = ctx.shell
  const prefix = shell.prefix

  const form = (url: string, values: Values, error?: string): string => {
    const options = [`<option value=""${values.albumId === '' ? ' selected' : ''}>Unfiled imports</option>`]
      .concat(
        gallery.albums().map(
          (album) =>
            `<option value="${escapeHtml(album.id)}"${values.albumId === album.id ? ' selected' : ''}>${escapeHtml(album.name)}</option>`,
        ),
      )
      .join('')
    const styles = ART_STYLES.map(
      (style) => `<option value="${style.value}"${values.art === style.value ? ' selected' : ''}>${style.label}</option>`,
    ).join('')
    const tones = PALETTES.map(
      (name, index) => `<option value="${String(index)}"${values.tone === String(index) ? ' selected' : ''}>${String(index + 1)} · ${name}</option>`,
    ).join('')
    const preview: ArtStyle = ART_STYLES.some((style) => style.value === values.art) ? (values.art as ArtStyle) : 'landscape'
    const tone = Number.parseInt(values.tone, 10)
    const art = artOf({ id: `${values.filename}${values.title}`, art: preview, tone: Number.isInteger(tone) ? tone : 0, width: 6_000, height: 4_000 })
    const main = `${shell.notice(url)}${pageHead({
      kicker: 'LIBRARY / UPLOAD',
      title: 'Add photographs',
      subtitle: 'Record a new frame. The preview is drawn offline from its style and palette; no file leaves this machine.',
    })}${error === undefined ? '' : `<p class="notice error" role="alert">${escapeHtml(error)}</p>`}<form class="form" method="post" action="${shell.href('/upload')}"><div class="formgrid"><label class="field"><span>FILE NAME</span><input name="filename" value="${escapeHtml(values.filename)}" placeholder="harbour-02.jpg" required></label><label class="field"><span>TITLE</span><input name="title" value="${escapeHtml(values.title)}" placeholder="Harbour wall" required></label><label class="field"><span>ALBUM</span><select name="albumId">${options}</select></label><label class="field"><span>TAGS</span><input name="tags" value="${escapeHtml(values.tags)}" placeholder="coast, morning"></label><label class="field"><span>ARTWORK</span><select name="art">${styles}</select></label><label class="field"><span>PALETTE</span><select name="tone">${tones}</select></label></div><label class="field"><span>DESCRIPTION</span><textarea name="description" placeholder="What the frame holds" required>${escapeHtml(values.description)}</textarea><span class="hint">Shown in the lightbox under the frame.</span></label><div class="field"><span>PREVIEW</span><img src="${art}" alt="" style="width:220px;height:148px;object-fit:cover;border-radius:6px;display:block"></div><div class="actions"><button class="button" type="submit">Add photograph</button><a class="cancel" href="${shell.href('/')}">Cancel</a></div></form>`
    return shell.page({ navActive: 'library', title: 'Add photographs', main })
  }

  const app = new Acryl()
    .get('/upload', (c) => {
      const first = gallery.albums()[0]
      return c.html(form(c.req.url, { ...EMPTY, albumId: first?.id ?? '' }))
    })
    .post('/upload', async (c) => {
      const values = valuesFrom(await c.req.parseBody(), EMPTY)
      try {
        const photo = await gallery.upload({
          filename: values.filename,
          title: values.title,
          albumId: values.albumId,
          description: values.description,
          tags: values.tags,
          art: values.art,
          tone: values.tone,
        })
        return c.redirect(shell.url(`/photos/${encodeURIComponent(photo.id)}`, { kind: 'ok', text: `${photo.filename} was added to the archive.` }), 303)
      } catch (error) {
        if (!(error instanceof GalleryError)) throw error
        return c.html(form(c.req.url, values, error.message))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
