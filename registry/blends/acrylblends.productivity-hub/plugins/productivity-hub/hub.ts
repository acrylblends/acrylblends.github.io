/**
 * The hub (`ctx.hub`): the one owner of the Productivity Hub's state. Every page plugin reads and changes it only through these methods, so the
 * rules (validation, triage, overlap confirmation) live in one place and every change is saved through the store before the method returns.
 */
import {
  addDays,
  type CalendarEvent,
  cleanBody,
  cleanCalendar,
  cleanCapture,
  cleanDue,
  cleanEstimate,
  cleanPriority,
  cleanTags,
  cleanTime,
  cleanTitle,
  completedToday,
  dayOf,
  eventsOn,
  focusTask,
  HubError,
  type HubState,
  type Id,
  type InboxItem,
  isOverdue,
  localTime,
  matches,
  nextActions,
  type Note,
  overlappingPairs,
  overlapsWith,
  type Project,
  recentNotes,
  type Task,
  type TaskStatus,
  taskOrder,
  weekDays,
} from './domain.ts'
import { seed } from './seed.ts'
import type { HubStore } from './store.ts'

/** What the hub needs from outside: where state is kept, what time it is, and how new ids are made. */
export interface HubAdapters {
  readonly store: HubStore
  readonly clock: () => Date
  readonly newId: (kind: 'task' | 'note' | 'event' | 'inbox') => Id
}

export interface TaskInput {
  readonly title?: unknown
  readonly dueAt?: unknown
  readonly priority?: unknown
  readonly projectId?: unknown
  readonly estimateMinutes?: unknown
  readonly noteId?: unknown
}

export interface NoteInput {
  readonly title?: unknown
  readonly body?: unknown
  readonly projectId?: unknown
  readonly tags?: unknown
}

export interface EventInput {
  readonly title?: unknown
  readonly startAt?: unknown
  readonly endAt?: unknown
  readonly calendarId?: unknown
  readonly detail?: unknown
  readonly projectId?: unknown
}

/** How an inbox item is triaged: into a task (with its date and space) or a note. */
export type Triage =
  | ({ readonly kind: 'task' } & TaskInput)
  | ({ readonly kind: 'note' } & NoteInput)

/** An event is saved, or held back because it overlaps others until the person confirms. */
export type EventResult =
  | { readonly kind: 'saved'; readonly event: CalendarEvent; readonly overlaps: readonly CalendarEvent[] }
  | { readonly kind: 'overlap'; readonly candidate: Omit<CalendarEvent, 'id'>; readonly overlaps: readonly CalendarEvent[] }

/** My Day, read in one go. */
export interface DayView {
  readonly day: string
  readonly focus?: Task
  readonly next: readonly Task[]
  readonly done: readonly Task[]
  readonly notes: readonly Note[]
  readonly events: readonly CalendarEvent[]
  readonly inboxCount: number
}

/** A week of the calendar: its days with their events, and which event ids overlap another. */
export interface WeekView {
  readonly start: string
  readonly days: readonly { readonly day: string; readonly events: readonly CalendarEvent[] }[]
  readonly overlapping: ReadonlySet<Id>
}

export interface TaskFilter {
  readonly status?: TaskStatus | 'all'
  readonly projectId?: Id
  readonly q?: string
}

const notFound = (what: string, id: string): HubError => new HubError('not-found', `There is no ${what} "${id}".`)

export class Hub {
  readonly #adapters: HubAdapters
  #state: HubState
  /** Saves run one after another, in the order the changes were made. */
  #saving: Promise<void> = Promise.resolve()

  private constructor(adapters: HubAdapters, state: HubState) {
    this.#adapters = adapters
    this.#state = state
  }

  /** The hub over the saved state, or over the seed (saved at once) on the first launch. */
  static async open(adapters: HubAdapters): Promise<Hub> {
    const saved = await adapters.store.load()
    const hub = new Hub(adapters, saved ?? seed(adapters.clock()))
    if (saved === undefined) await hub.#commit(hub.#state)
    return hub
  }

  /** The current state, read-only. */
  get state(): HubState {
    return this.#state
  }

  now(): Date {
    return this.#adapters.clock()
  }

  /** Wait until every change made so far is saved. */
  flush(): Promise<void> {
    return this.#saving
  }

  async #commit(next: HubState): Promise<void> {
    this.#state = next
    const save = this.#saving.then(() => this.#adapters.store.save(next))
    this.#saving = save.catch(() => {})
    await save
  }

  // Reads.

  projects(): readonly Project[] {
    return this.#state.projects
  }

  project(id: Id | undefined): Project | undefined {
    return id === undefined ? undefined : this.#state.projects.find((project) => project.id === id)
  }

  day(): DayView {
    const now = this.now()
    return {
      day: dayOf(now),
      ...(focusTask(this.#state, now) === undefined ? {} : { focus: focusTask(this.#state, now) as Task }),
      next: nextActions(this.#state, now),
      done: completedToday(this.#state, now),
      notes: recentNotes(this.#state, 2),
      events: eventsOn(this.#state.events, dayOf(now)),
      inboxCount: this.#state.inbox.length,
    }
  }

  inbox(): readonly InboxItem[] {
    return [...this.#state.inbox].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
  }

  tasks(filter: TaskFilter = {}): Task[] {
    const status = filter.status ?? 'open'
    return this.#state.tasks
      .filter(
        (task) =>
          (status === 'all' || task.status === status) &&
          (filter.projectId === undefined || task.projectId === filter.projectId) &&
          matches(filter.q, task.title),
      )
      .sort(taskOrder)
  }

  task(id: Id): Task {
    const task = this.#state.tasks.find((t) => t.id === id)
    if (task === undefined) throw notFound('task', id)
    return task
  }

  isOverdue(task: Task): boolean {
    return isOverdue(task, this.now())
  }

  notes(q?: string): Note[] {
    return recentNotes(this.#state).filter((note) => matches(q, note.title, note.body, ...note.tags))
  }

  note(id: Id): Note {
    const note = this.#state.notes.find((n) => n.id === id)
    if (note === undefined) throw notFound('note', id)
    return note
  }

  /** The tasks linked to a note. */
  linkedTasks(noteId: Id): Task[] {
    return this.#state.tasks.filter((task) => task.noteId === noteId).sort(taskOrder)
  }

  /** The week `day` is in (today's when absent), Monday to Sunday. */
  week(day?: string): WeekView {
    const days = weekDays(day ?? dayOf(this.now()))
    const inWeek = this.#state.events.filter((event) => days.includes(dayOf(event.startAt)))
    return {
      start: days[0] as string,
      days: days.map((d) => ({ day: d, events: eventsOn(inWeek, d) })),
      overlapping: new Set(overlappingPairs(inWeek).flat()),
    }
  }

  event(id: Id): CalendarEvent {
    const event = this.#state.events.find((e) => e.id === id)
    if (event === undefined) throw notFound('event', id)
    return event
  }

  // Changes.

  #projectId(value: unknown): Id | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const id = String(value)
    if (this.project(id) === undefined) throw notFound('space', id)
    return id
  }

  #noteId(value: unknown): Id | undefined {
    if (value === undefined || value === null || value === '') return undefined
    return this.note(String(value)).id
  }

  async capture(text: unknown): Promise<InboxItem> {
    const item: InboxItem = { id: this.#adapters.newId('inbox'), text: cleanCapture(text), capturedAt: localTime(this.now()) }
    await this.#commit({ ...this.#state, inbox: [...this.#state.inbox, item] })
    return item
  }

  async discard(itemId: Id): Promise<void> {
    if (!this.#state.inbox.some((item) => item.id === itemId)) throw notFound('inbox item', itemId)
    await this.#commit({ ...this.#state, inbox: this.#state.inbox.filter((item) => item.id !== itemId) })
  }

  /** Turn an inbox item into a task or a note (its text is the title unless one is given); the item leaves the inbox. */
  async triage(itemId: Id, as: Triage): Promise<Task | Note> {
    const item = this.#state.inbox.find((i) => i.id === itemId)
    if (item === undefined) throw notFound('inbox item', itemId)
    const inbox = this.#state.inbox.filter((i) => i.id !== itemId)
    if (as.kind === 'task') {
      const task = this.#newTask({ ...as, title: as.title === undefined || as.title === '' ? item.text : as.title })
      await this.#commit({ ...this.#state, inbox, tasks: [...this.#state.tasks, task] })
      return task
    }
    const titled = as.title !== undefined && as.title !== ''
    const note = this.#newNote({ ...as, title: titled ? as.title : item.text.slice(0, 80), body: titled ? item.text : (as.body ?? '') })
    await this.#commit({ ...this.#state, inbox, notes: [...this.#state.notes, note] })
    return note
  }

  #newTask(input: TaskInput): Task {
    const dueAt = cleanDue(input.dueAt)
    const projectId = this.#projectId(input.projectId)
    const estimateMinutes = cleanEstimate(input.estimateMinutes)
    const noteId = this.#noteId(input.noteId)
    return {
      id: this.#adapters.newId('task'),
      title: cleanTitle(input.title, 'task title'),
      status: 'open',
      ...(dueAt === undefined ? {} : { dueAt }),
      priority: cleanPriority(input.priority),
      ...(projectId === undefined ? {} : { projectId }),
      ...(estimateMinutes === undefined ? {} : { estimateMinutes }),
      ...(noteId === undefined ? {} : { noteId }),
      steps: [],
    }
  }

  async addTask(input: TaskInput): Promise<Task> {
    const task = this.#newTask(input)
    await this.#commit({ ...this.#state, tasks: [...this.#state.tasks, task] })
    return task
  }

  async #replaceTask(id: Id, change: (task: Task) => Task): Promise<Task> {
    const task = change(this.task(id))
    await this.#commit({ ...this.#state, tasks: this.#state.tasks.map((t) => (t.id === id ? task : t)) })
    return task
  }

  /** Change a task's fields; a field left out keeps its value, an empty one clears it (the title cannot be cleared). */
  updateTask(id: Id, patch: TaskInput): Promise<Task> {
    return this.#replaceTask(id, (task) => {
      const next: Record<string, unknown> = { ...task }
      if (patch.title !== undefined) next.title = cleanTitle(patch.title, 'task title')
      if (patch.priority !== undefined) next.priority = cleanPriority(patch.priority)
      const optional = {
        dueAt: () => cleanDue(patch.dueAt),
        projectId: () => this.#projectId(patch.projectId),
        estimateMinutes: () => cleanEstimate(patch.estimateMinutes),
        noteId: () => this.#noteId(patch.noteId),
      } as const
      for (const [key, clean] of Object.entries(optional))
        if ((patch as Record<string, unknown>)[key] !== undefined) {
          const value = clean()
          if (value === undefined) delete next[key]
          else next[key] = value
        }
      return next as unknown as Task
    })
  }

  completeTask(id: Id): Promise<Task> {
    const completedAt = localTime(this.now())
    return this.#replaceTask(id, (task) => (task.status === 'done' ? task : { ...task, status: 'done', completedAt }))
  }

  reopenTask(id: Id): Promise<Task> {
    return this.#replaceTask(id, ({ completedAt: _, ...task }) => ({ ...task, status: 'open' }))
  }

  async deleteTask(id: Id): Promise<void> {
    this.task(id)
    const focus = this.#state.focus?.taskId === id ? undefined : this.#state.focus
    const { focus: _, ...rest } = this.#state
    await this.#commit({ ...rest, ...(focus === undefined ? {} : { focus }), tasks: this.#state.tasks.filter((t) => t.id !== id) })
  }

  /** Make an open task today's focus. */
  async setFocus(id: Id): Promise<void> {
    const task = this.task(id)
    if (task.status !== 'open') throw new HubError('invalid', 'A completed task cannot be the focus.')
    await this.#commit({ ...this.#state, focus: { date: dayOf(this.now()), taskId: id } })
  }

  toggleStep(id: Id, index: number): Promise<Task> {
    return this.#replaceTask(id, (task) => {
      const step = task.steps[index]
      if (step === undefined) throw notFound('step', `${id}#${index}`)
      return { ...task, steps: task.steps.map((s, i) => (i === index ? { ...s, done: !s.done } : s)) }
    })
  }

  #newNote(input: NoteInput): Note {
    const projectId = this.#projectId(input.projectId)
    return {
      id: this.#adapters.newId('note'),
      title: cleanTitle(input.title, 'note title'),
      body: cleanBody(input.body),
      updatedAt: localTime(this.now()),
      ...(projectId === undefined ? {} : { projectId }),
      tags: cleanTags(input.tags),
    }
  }

  async addNote(input: NoteInput): Promise<Note> {
    const note = this.#newNote(input)
    await this.#commit({ ...this.#state, notes: [...this.#state.notes, note] })
    return note
  }

  /** Save a note's title, body, space and tags; it moves to the top of Recent notes. */
  async saveNote(id: Id, input: NoteInput): Promise<Note> {
    const old = this.note(id)
    const projectId = input.projectId === undefined ? old.projectId : this.#projectId(input.projectId)
    const { projectId: _, ...rest } = old
    const note: Note = {
      ...rest,
      title: input.title === undefined ? old.title : cleanTitle(input.title, 'note title'),
      body: input.body === undefined ? old.body : cleanBody(input.body),
      tags: input.tags === undefined ? old.tags : cleanTags(input.tags),
      ...(projectId === undefined ? {} : { projectId }),
      updatedAt: localTime(this.now()),
    }
    await this.#commit({ ...this.#state, notes: this.#state.notes.map((n) => (n.id === id ? note : n)) })
    return note
  }

  async deleteNote(id: Id): Promise<void> {
    this.note(id)
    await this.#commit({
      ...this.#state,
      notes: this.#state.notes.filter((n) => n.id !== id),
      tasks: this.#state.tasks.map(({ noteId, ...task }) => (noteId === id || noteId === undefined ? task : { ...task, noteId })),
    })
  }

  #candidate(input: EventInput): Omit<CalendarEvent, 'id'> {
    const title = cleanTitle(input.title, 'event title')
    const startAt = cleanTime(input.startAt, 'The start')
    if (startAt === undefined) throw new HubError('invalid', 'An event needs a start.')
    const endAt = cleanTime(input.endAt, 'The end') ?? localTime(new Date(new Date(startAt).getTime() + 30 * 60_000))
    if (new Date(endAt) <= new Date(startAt)) throw new HubError('invalid', 'An event ends after it starts.')
    if (dayOf(endAt) !== dayOf(startAt) && dayOf(endAt) !== addDays(dayOf(startAt), 1))
      throw new HubError('invalid', 'An event lasts at most until the next day.')
    const detail = typeof input.detail === 'string' && input.detail.trim() !== '' ? input.detail.trim().slice(0, 120) : undefined
    const projectId = this.#projectId(input.projectId)
    return {
      title,
      startAt,
      endAt,
      calendarId: cleanCalendar(input.calendarId),
      ...(detail === undefined ? {} : { detail }),
      ...(projectId === undefined ? {} : { projectId }),
    }
  }

  /**
   * Add an event. One that overlaps others is not saved unless `confirm` is true: the result names the events it would overlap, so the page can ask
   * and send it again confirmed.
   */
  async addEvent(input: EventInput, options: { readonly confirm?: boolean } = {}): Promise<EventResult> {
    const candidate = this.#candidate(input)
    const overlaps = overlapsWith(this.#state.events, candidate)
    if (overlaps.length > 0 && options.confirm !== true) return { kind: 'overlap', candidate, overlaps }
    const event: CalendarEvent = { id: this.#adapters.newId('event'), ...candidate }
    await this.#commit({ ...this.#state, events: [...this.#state.events, event] })
    return { kind: 'saved', event, overlaps }
  }

  async deleteEvent(id: Id): Promise<void> {
    this.event(id)
    await this.#commit({ ...this.#state, events: this.#state.events.filter((e) => e.id !== id) })
  }
}
