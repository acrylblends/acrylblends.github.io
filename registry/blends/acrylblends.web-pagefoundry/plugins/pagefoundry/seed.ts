/** The site a person sees on the first start: Northstar Studio with Home (hero, features, call to action), Features and Pricing pages, no builds yet, in the editor. */
import { type Page, type SiteState, newSection } from './domain.ts'

const hero = (id: string, headline: string, body: string, button: string) => ({ ...newSection('hero', id), headline, body, button, bg: '#e9efe3' })

export function seed(): SiteState {
  const features = {
    ...newSection('features', 'features-1'),
    headline: 'Small team. Wide perspective.',
    items: [
      { title: '01 / Strategy', text: 'Find the signal in a complex brief and set a clear direction.' },
      { title: '02 / Design', text: 'Make useful things feel natural, distinctive and calm.' },
      { title: '03 / Build', text: 'Ship solid products with room to grow.' },
    ],
  }
  const cta = { ...newSection('cta', 'cta-1'), headline: 'Have something in mind?', body: 'Let’s make the next thing matter.', button: 'Start a project ↗' }
  const pages: Page[] = [
    { id: 'home', name: 'Home', sections: [hero('hero-1', 'Make space for\nwhat matters.', 'We build thoughtful digital products and experiences for teams ready to move with intention.', 'Explore our work ↗'), features, cta] },
    { id: 'features', name: 'Features', sections: [hero('hero-2', 'Everything in its right place.', 'Tools that stay out of the way until you need them.', 'See how it works ↗'), { ...features, id: 'features-2', headline: 'What is inside' }] },
    { id: 'pricing', name: 'Pricing', sections: [hero('hero-3', 'Simple plans.\nRoom to grow.', 'Pay for what you use. Change your mind whenever you like.', 'Compare plans ↗'), { ...cta, id: 'cta-2' }] },
  ]
  return { version: 1, name: 'Northstar Studio', domain: 'northstar.studio', pages, theme: { accent: '#e16c4c', serif: true }, builds: [], view: { preview: false, device: 'desktop' } }
}
