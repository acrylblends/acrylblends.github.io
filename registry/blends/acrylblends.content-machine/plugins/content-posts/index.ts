/**
 * Step 5c, the words around the video: a YouTube title, description and tags, a LinkedIn post, an Instagram caption, a post for X, and a thumbnail
 * headline, written by the AI writer from the transcript and the brand (what it sells, to whom, in which tone, the offers and links to mention).
 * Nothing is posted anywhere: the screen shows them with Copy, the files go with the export.
 */
import { writeFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '../content/index.ts'
import { type Posts, Refusal, writeJson } from '../content/index.ts'

export const name = 'content-posts'
export const inject = ['content']

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** The writer's answer made safe: every field text of a fair length, tags a short list. */
export function postsFrom(answer: Record<string, unknown>, at: string): Posts {
  const youtube = (answer.youtube ?? {}) as Record<string, unknown>
  const tags = Array.isArray(youtube.tags) ? youtube.tags.map((t) => text(t, 40)).filter(Boolean).slice(0, 15) : []
  const posts: Posts = {
    youtube: { title: text(youtube.title, 100), description: text(youtube.description, 5000), tags },
    linkedin: text(answer.linkedin, 3000),
    instagram: text(answer.instagram, 2200),
    x: text(answer.x, 280),
    thumbnailText: text(answer.thumbnailText, 60),
    at,
  }
  if (posts.youtube.title === '' && posts.linkedin === '') throw new Refusal('unavailable', 'the writer answered without posts; try again')
  return posts
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.content.features.register({
    id: 'posts',
    title: 'Posts',
    order: 9,
    summary: 'The YouTube title, description and tags, a LinkedIn post, an Instagram caption and a post for X, in your brand\'s voice.',
    actions: {
      write: {
        title: 'Write the posts',
        description: 'Writes the YouTube title, description and tags, the LinkedIn post, the Instagram caption, the X post and a thumbnail headline from the transcript and the brand.',
        input: { type: 'object', properties: { note: { type: 'string', description: 'Anything to stress (an offer, a date, a call to action)' } }, additionalProperties: false },
        async run(context, input) {
          const project = context.project()
          if (!project.transcript) throw new Refusal('invalid', 'the posts are written from the transcript: make one first')
          const brand = context.machine.brand()
          context.progress(0.2, 'writing')
          const answer = (await writeJson(context.machine.root, [
            { role: 'system', content: 'You are the social media writer of a small business. You write in the language of the video. Never invent prices, dates or claims that are not in the brand notes or the video. Answer JSON only.' },
            { role: 'user', content: [
              `Brand: ${brand.name || 'not named'}`, `What it does: ${brand.about}`, `Audience: ${brand.audience}`, `Tone: ${brand.tone}`,
              `Offers and prices to mention when they fit: ${brand.offers || 'none'}`, `Call to action: ${brand.callToAction || 'none'}`, `Links: ${brand.links || 'none'}`,
              typeof input.note === 'string' && input.note.trim() !== '' ? `Stress this: ${input.note.trim()}` : '',
              `\nThe video${project.visuals.title ? ` "${project.visuals.title}"` : ''} says:\n${project.transcript.text.slice(0, 12000)}`,
              '\nWrite: a YouTube title (at most 70 characters), a YouTube description (3 short paragraphs, then the links), up to 12 tags; a LinkedIn post (a hook line, short paragraphs, no more than 3 hashtags); an Instagram caption (with line breaks and up to 8 hashtags); a post for X (at most 270 characters); a thumbnail headline of 2 to 5 words.',
              'Answer {"youtube":{"title":"","description":"","tags":[]},"linkedin":"","instagram":"","x":"","thumbnailText":""}',
            ].filter(Boolean).join('\n') },
          ], context.signal)) as Record<string, unknown>
          const posts = postsFrom(answer, new Date().toISOString())
          writeFileSync(context.path('posts.md'), [
            `# ${posts.youtube.title}`, '', '## YouTube', '', posts.youtube.description, '', `Tags: ${posts.youtube.tags.join(', ')}`,
            '', '## LinkedIn', '', posts.linkedin, '', '## Instagram', '', posts.instagram, '', '## X', '', posts.x, '',
          ].join('\n'))
          context.update(() => ({ posts }))
          return posts
        },
      },
    },
  }), 'content-posts: the step')
}
