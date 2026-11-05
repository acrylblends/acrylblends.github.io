/**
 * The first-launch data: three spaces, six tasks, four notes, three inbox captures and one week of meetings and focus blocks, laid around the day
 * the hub first starts, so My Day always opens on a full, believable day (one overdue task, two done today, an overlap later this week).
 */
import { addDays, type CalendarEvent, dayOf, type HubState, localTime, type Note, startOfDay, type Task, weekDays } from './domain.ts'

/** `day` at `hh:mm`, as the hub stores it. */
const at = (day: string, time: string): string => `${day}T${time}`

/** A time `minutes` before `now`. */
const ago = (now: Date, minutes: number): string => localTime(new Date(now.getTime() - minutes * 60_000))

export function seed(now: Date): HubState {
  const today = dayOf(now)
  const yesterday = addDays(today, -1)
  const tomorrow = addDays(today, 1)
  const later = addDays(today, 2)
  const week = weekDays(today).slice(0, 5)

  const tasks: Task[] = [
    {
      id: 'task-onboarding',
      title: 'Ship the first version of the onboarding flow',
      status: 'open',
      dueAt: at(today, '17:00'),
      priority: 'high',
      projectId: 'space-launch',
      estimateMinutes: 180,
      noteId: 'note-onboarding',
      steps: [
        { title: 'Agree the three first-run screens', done: true },
        { title: 'Build the welcome screen', done: true },
        { title: 'Wire the sample project', done: false },
        { title: 'Test with two people', done: false },
      ],
    },
    {
      id: 'task-copy',
      title: 'Review onboarding copy',
      status: 'open',
      dueAt: at(today, '17:00'),
      priority: 'normal',
      projectId: 'space-launch',
      estimateMinutes: 30,
      noteId: 'note-onboarding',
      steps: [],
    },
    {
      id: 'task-estimate',
      title: 'Send revised estimate to Marta',
      status: 'open',
      dueAt: at(today, '11:30'),
      priority: 'high',
      projectId: 'space-launch',
      estimateMinutes: 15,
      steps: [],
    },
    {
      id: 'task-review',
      title: 'Prepare notes for weekly review',
      status: 'open',
      dueAt: at(today, '15:00'),
      priority: 'normal',
      projectId: 'space-personal',
      estimateMinutes: 20,
      steps: [],
    },
    {
      id: 'task-library',
      title: 'Return "Deep Work" to the library',
      status: 'open',
      dueAt: at(yesterday, '18:00'),
      priority: 'low',
      projectId: 'space-reading',
      estimateMinutes: 15,
      steps: [],
    },
    {
      id: 'task-dentist',
      title: 'Book the dentist',
      status: 'done',
      dueAt: at(today, '10:00'),
      priority: 'normal',
      projectId: 'space-personal',
      estimateMinutes: 5,
      steps: [],
      completedAt: ago(now, 50),
    },
  ]

  const notes: Note[] = [
    {
      id: 'note-onboarding',
      title: 'Onboarding: open questions',
      body: 'Keep the first run to one clear action. Defer profile enrichment until the person has seen value.\n\n- Which sample project do we show first?\n- Can we skip the tour for returning people?',
      updatedAt: at(yesterday, '16:40'),
      projectId: 'space-launch',
      tags: ['onboarding', 'questions'],
    },
    {
      id: 'note-ideas',
      title: 'Ideas worth exploring',
      body: 'Local-first capture, a reading inbox, and a weekly reset under 20 minutes.',
      updatedAt: at(addDays(today, -5), '08:15'),
      projectId: 'space-personal',
      tags: ['ideas'],
    },
    {
      id: 'note-deep-work',
      title: 'Reading notes: Deep Work',
      body: 'Schedule every minute of the day. Shallow work expands to fill the time you give it; a fixed end of day protects the deep blocks.',
      updatedAt: at(addDays(today, -7), '21:05'),
      projectId: 'space-reading',
      tags: ['books', 'focus'],
    },
    {
      id: 'note-launch',
      title: 'Launch checklist',
      body: 'Pricing page reviewed, support inbox staffed, changelog written, rollback plan agreed with the team.',
      updatedAt: at(addDays(today, -6), '11:20'),
      projectId: 'space-launch',
      tags: ['launch'],
    },
  ]

  const standUps: CalendarEvent[] = week.map((day) => ({
    id: `event-standup-${day}`,
    title: 'Product stand-up',
    startAt: at(day, '09:00'),
    endAt: at(day, '09:30'),
    calendarId: 'meeting',
    detail: 'Team sync',
    projectId: 'space-launch',
  }))
  const events: CalendarEvent[] = [
    ...(week.includes(today) ? [] : [{ ...(standUps[0] as CalendarEvent), id: `event-standup-${today}`, startAt: at(today, '09:00'), endAt: at(today, '09:30') }]),
    ...standUps,
    { id: 'event-estimate', title: 'Estimate review', startAt: at(today, '11:30'), endAt: at(today, '12:00'), calendarId: 'meeting', detail: 'Marta', projectId: 'space-launch' },
    { id: 'event-planning', title: 'Weekly planning', startAt: at(today, '15:00'), endAt: at(today, '15:45'), calendarId: 'focus', detail: 'Focus block', projectId: 'space-personal' },
    { id: 'event-critique', title: 'Design critique', startAt: at(tomorrow, '10:00'), endAt: at(tomorrow, '10:45'), calendarId: 'meeting', detail: 'Product launch', projectId: 'space-launch' },
    { id: 'event-deep-work', title: 'Deep work', startAt: at(tomorrow, '14:00'), endAt: at(tomorrow, '16:00'), calendarId: 'focus', detail: 'Blocked time' },
    { id: 'event-retro', title: 'Launch retro', startAt: at(later, '16:00'), endAt: at(later, '17:00'), calendarId: 'meeting', detail: 'Whole team', projectId: 'space-launch' },
    { id: 'event-gym', title: 'Climbing', startAt: at(later, '16:30'), endAt: at(later, '18:00'), calendarId: 'personal', detail: 'Bouldering hall', projectId: 'space-personal' },
  ]

  return {
    version: 1,
    projects: [
      { id: 'space-launch', name: 'Product launch', color: 'amber' },
      { id: 'space-personal', name: 'Personal', color: 'sky' },
      { id: 'space-reading', name: 'Reading list', color: 'sage' },
    ],
    tasks,
    notes,
    events,
    inbox: [
      { id: 'inbox-podcast', text: 'Podcast episode on calm onboarding, listen on the train', capturedAt: ago(now, 30) },
      { id: 'inbox-invoice', text: 'Ask Marta whether the invoice goes to the new address', capturedAt: ago(now, 95) },
      { id: 'inbox-gift', text: 'Birthday gift idea for Sam: a good notebook', capturedAt: localTime(new Date(startOfDay(yesterday).getTime() + 19 * 3_600_000)) },
    ],
    focus: { date: today, taskId: 'task-onboarding' },
  }
}
