/** The journal a person sees on the first start: Alex, a daily focus with three of five small goals done, three entries and the mockup's widget settings. */
import type { JournalState } from './domain.ts'

export function seed(now: Date): JournalState {
  const at = (days: number, h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, h, m).toISOString()
  return {
    version: 1,
    name: 'Alex',
    focus: 'Make room for ideas.',
    goals: [
      { id: 'g1', text: 'Write down one idea', done: true },
      { id: 'g2', text: 'Walk for ten minutes', done: true },
      { id: 'g3', text: 'Reply to one message', done: true },
      { id: 'g4', text: 'Tidy the desk', done: false },
      { id: 'g5', text: 'Plan tomorrow', done: false },
    ],
    widgets: { focus: true, quick: true, moments: true },
    preferences: { compact: false, quiet: false, quietFrom: '22:00', quietTo: '08:00' },
    entries: [
      { id: 'e3', title: 'Things to remember', kind: 'voice', at: at(4, 18, 20) },
      { id: 'e2', title: 'Morning walk', kind: 'note', at: at(1, 8, 12) },
      { id: 'e1', title: 'Idea for the studio', kind: 'note', at: at(0, 7, 55) },
    ],
  }
}
