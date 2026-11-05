/**
 * The CRM: companies, contacts, deals, activities and follow-ups kept in one state, with every rule of the pipeline. Its outside effects (where the state
 * is saved, what time it is, how ids are made) come in as adapters, so tests hand in fakes and a person's data lives behind the store port.
 */
import {
  ACTIVITY_TYPES,
  type Activity,
  type ActivityType,
  addDays,
  BOARD_STAGES,
  type Channel,
  CHANNELS,
  type Company,
  type Contact,
  CrmError,
  type CrmState,
  cleanDay,
  cleanStamp,
  cleanText,
  cleanValue,
  type Deal,
  dayOf,
  euro,
  euroShort,
  initialsOf,
  longDay,
  shortDay,
  whenText,
  isEmail,
  isOpen,
  OPEN_STAGES,
  type Owner,
  STAGE_LABEL,
  STAGE_PROBABILITY,
  STAGES,
  type Stage,
  stampOf,
  type Task,
  taskState,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface CrmAdapters {
  readonly store: Store<CrmState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

/** Which deals a view lists. */
export interface DealFilter {
  readonly tab?: 'all' | 'mine' | 'unassigned'
  /** Matches the company, the deal title and the contact, ignoring case. */
  readonly q?: string
  /** The signed-in owner for the "mine" tab. */
  readonly me?: string
}

export interface BoardColumn {
  readonly stage: Stage
  readonly label: string
  readonly deals: readonly Deal[]
  readonly total: number
}

export interface FollowUp {
  readonly task: Task
  readonly deal: Deal
  readonly company: Company
  readonly state: 'overdue' | 'today' | 'later'
}

export interface StageReport {
  readonly stage: Stage
  readonly label: string
  readonly count: number
  readonly value: number
  readonly weighted: number
}

export interface PipelineReport {
  readonly stages: readonly StageReport[]
  readonly open: { readonly count: number; readonly value: number; readonly weighted: number }
  readonly won: { readonly count: number; readonly value: number }
  readonly lost: { readonly count: number; readonly value: number }
  /** Won deals as a share of closed deals (0 to 100); null when nothing is closed. */
  readonly winRate: number | null
  readonly averageDeal: number | null
  readonly byOwner: readonly { readonly owner: Owner | null; readonly count: number; readonly value: number }[]
}

/**
 * The rules and formatters the pages share, reached through `ctx.crm.kit`: a page plugin imports only the domain's types, never its code (a plugin that
 * another needs is reached through its service).
 */
export const CRM_KIT = {
  euro,
  euroShort,
  shortDay,
  longDay,
  whenText,
  initialsOf,
  taskState,
  isOpen,
  STAGE_LABEL,
  OPEN_STAGES,
  ACTIVITY_TYPES,
  CHANNELS,
  /** Whether an error is a refusal written for the person (shown as a notice) rather than a fault. */
  isRefusal: (error: unknown): error is CrmError => error instanceof CrmError,
} as const

export class Crm {
  /** See {@link CRM_KIT}. */
  readonly kit = CRM_KIT
  private readonly adapters: CrmAdapters
  private current: CrmState

  private constructor(adapters: CrmAdapters, current: CrmState) {
    this.adapters = adapters
    this.current = current
  }

  /** Open the CRM over what the store holds; the first time (nothing saved) it starts from the seed and saves it at once. */
  static async open(adapters: CrmAdapters): Promise<Crm> {
    const saved = await adapters.store.load()
    const crm = new Crm(adapters, saved ?? seed())
    if (saved === undefined) await adapters.store.save(crm.current)
    return crm
  }

  get state(): Readonly<CrmState> {
    return this.current
  }

  get today(): string {
    return dayOf(this.adapters.clock())
  }

  private get now(): string {
    return stampOf(this.adapters.clock())
  }

  /** A new id that no record has yet (a fake id maker in a test, or a rare random clash, never overwrites a record). */
  private newId(kind: string): string {
    const taken = new Set<string>(
      [this.current.companies, this.current.contacts, this.current.deals, this.current.activities, this.current.tasks].flatMap((list) =>
        list.map((item: { id: string }) => item.id),
      ),
    )
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const id = this.adapters.newId(kind)
      if (!taken.has(id)) return id
    }
    throw new Error(`could not make a new ${kind} id`)
  }

  /** Newest first; two records of the same minute keep the order they were made in (the later one first). */
  private newestFirst<T extends { at: string }>(list: readonly T[]): T[] {
    return list
      .map((item, index) => ({ item, index }))
      .sort((a, b) => b.item.at.localeCompare(a.item.at) || b.index - a.index)
      .map(({ item }) => item)
  }

  private async commit(): Promise<void> {
    await this.adapters.store.save(this.current)
  }

  // --- reading ---

  owners = (): readonly Owner[] => this.current.owners
  /** The person using the app: the first owner. */
  me = (): Owner => this.current.owners[0] as Owner
  companies = (): readonly Company[] => [...this.current.companies].sort((a, b) => a.name.localeCompare(b.name))
  contacts = (): readonly Contact[] => [...this.current.contacts].sort((a, b) => a.name.localeCompare(b.name))
  deals = (): readonly Deal[] => this.current.deals

  owner(id: string | undefined): Owner | undefined {
    return id === undefined ? undefined : this.current.owners.find((owner) => owner.id === id)
  }

  company(id: string): Company {
    const found = this.current.companies.find((company) => company.id === id)
    if (found === undefined) throw new CrmError('not-found', 'That company does not exist.')
    return found
  }

  contact(id: string): Contact {
    const found = this.current.contacts.find((contact) => contact.id === id)
    if (found === undefined) throw new CrmError('not-found', 'That contact does not exist.')
    return found
  }

  deal(id: string): Deal {
    const found = this.current.deals.find((deal) => deal.id === id)
    if (found === undefined) throw new CrmError('not-found', 'That deal does not exist.')
    return found
  }

  contactsOf = (companyId: string): readonly Contact[] => this.contacts().filter((contact) => contact.companyId === companyId)
  dealsOf = (companyId: string): readonly Deal[] => this.current.deals.filter((deal) => deal.companyId === companyId)
  /** Contacts with no company. */
  orphans = (): readonly Contact[] => this.contacts().filter((contact) => contact.companyId === undefined)

  /** A deal's activity, newest first. */
  activityOf = (dealId: string): readonly Activity[] => this.newestFirst(this.current.activities.filter((activity) => activity.dealId === dealId))

  /** Every activity, newest first, optionally of one type. */
  activities(type?: ActivityType): readonly Activity[] {
    return this.newestFirst(this.current.activities.filter((activity) => type === undefined || activity.type === type))
  }

  /** The open follow-up of a deal (the soonest), if any. */
  nextAction(dealId: string): Task | undefined {
    return this.current.tasks.filter((task) => task.dealId === dealId && task.status === 'open').sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
  }

  /** Open follow-ups, overdue first, then by time. */
  followUps(): readonly FollowUp[] {
    const today = this.today
    const result: FollowUp[] = []
    for (const task of this.current.tasks) {
      if (task.status !== 'open') continue
      const deal = this.current.deals.find((candidate) => candidate.id === task.dealId)
      if (deal === undefined) continue
      const state = taskState(task, today) as 'overdue' | 'today' | 'later'
      result.push({ task, deal, company: this.company(deal.companyId), state })
    }
    return result.sort((a, b) => a.task.dueAt.localeCompare(b.task.dueAt))
  }

  /** The deals a filter lists, in the board's order (soonest close date first). */
  filtered(filter: DealFilter = {}): readonly Deal[] {
    const query = filter.q?.trim().toLowerCase() ?? ''
    return this.current.deals
      .filter((deal) => {
        if (filter.tab === 'mine' && deal.ownerId !== (filter.me ?? this.me().id)) return false
        if (filter.tab === 'unassigned' && deal.ownerId !== undefined) return false
        if (query === '') return true
        const contact = deal.contactId === undefined ? '' : this.contact(deal.contactId).name
        return `${this.company(deal.companyId).name} ${deal.title} ${contact}`.toLowerCase().includes(query)
      })
      .sort((a, b) => a.closeDate.localeCompare(b.closeDate) || a.title.localeCompare(b.title))
  }

  /** Counts for the board's tabs (not narrowed by the search). */
  tabCounts(): { all: number; mine: number; unassigned: number } {
    return {
      all: this.filtered({ tab: 'all' }).length,
      mine: this.filtered({ tab: 'mine' }).length,
      unassigned: this.filtered({ tab: 'unassigned' }).length,
    }
  }

  board(filter: DealFilter = {}): readonly BoardColumn[] {
    const deals = this.filtered(filter)
    return BOARD_STAGES.map((stage) => {
      const inStage = deals.filter((deal) => deal.stage === stage)
      return { stage, label: STAGE_LABEL[stage], deals: inStage, total: inStage.reduce((sum, deal) => sum + deal.value, 0) }
    })
  }

  /** The strip above the board, for the deals a filter lists. */
  totals(filter: DealFilter = {}): { pipeline: number; weighted: number; expectedThisMonth: number; wonRecently: number } {
    const deals = this.filtered(filter)
    const open = deals.filter((deal) => isOpen(deal.stage))
    const month = this.today.slice(0, 7)
    const since = addDays(this.today, -30)
    return {
      pipeline: open.reduce((sum, deal) => sum + deal.value, 0),
      weighted: Math.round(open.reduce((sum, deal) => sum + (deal.value * deal.probability) / 100, 0)),
      expectedThisMonth: Math.round(
        open.filter((deal) => deal.closeDate.startsWith(month)).reduce((sum, deal) => sum + (deal.value * deal.probability) / 100, 0),
      ),
      wonRecently: deals.filter((deal) => deal.stage === 'won' && deal.closeDate >= since).reduce((sum, deal) => sum + deal.value, 0),
    }
  }

  report(): PipelineReport {
    const deals = this.current.deals
    const stages = STAGES.map((stage) => {
      const inStage = deals.filter((deal) => deal.stage === stage)
      return {
        stage,
        label: STAGE_LABEL[stage],
        count: inStage.length,
        value: inStage.reduce((sum, deal) => sum + deal.value, 0),
        weighted: Math.round(inStage.reduce((sum, deal) => sum + (deal.value * deal.probability) / 100, 0)),
      }
    })
    const open = deals.filter((deal) => isOpen(deal.stage))
    const won = deals.filter((deal) => deal.stage === 'won')
    const lost = deals.filter((deal) => deal.stage === 'lost')
    const sum = (list: readonly Deal[]) => list.reduce((total, deal) => total + deal.value, 0)
    const people: (Owner | null)[] = [...this.current.owners, null]
    return {
      stages,
      open: {
        count: open.length,
        value: sum(open),
        weighted: Math.round(open.reduce((total, deal) => total + (deal.value * deal.probability) / 100, 0)),
      },
      won: { count: won.length, value: sum(won) },
      lost: { count: lost.length, value: sum(lost) },
      winRate: won.length + lost.length === 0 ? null : Math.round((won.length / (won.length + lost.length)) * 100),
      averageDeal: deals.length === 0 ? null : Math.round(sum(deals) / deals.length),
      byOwner: people.map((owner) => {
        const own = open.filter((deal) => (owner === null ? deal.ownerId === undefined : deal.ownerId === owner.id))
        return { owner, count: own.length, value: sum(own) }
      }),
    }
  }

  // --- changing ---

  async createCompany(input: { name: unknown; website?: unknown; industry?: unknown }): Promise<Company> {
    const name = cleanText(input.name, 'The company name')
    if (this.current.companies.some((company) => company.name.toLowerCase() === name.toLowerCase()))
      throw new CrmError('conflict', `${name} is already in the CRM.`)
    const tints = ['purple', 'orange', 'teal', 'blue', 'red', 'gold', 'green']
    const company: Company = {
      id: this.newId('company'),
      name,
      website: cleanText(input.website, 'The website', 120, false),
      industry: cleanText(input.industry, 'The industry', 80, false),
      tint: tints[this.current.companies.length % tints.length] as string,
    }
    this.current.companies.push(company)
    await this.commit()
    return company
  }

  async createContact(input: { name: unknown; email?: unknown; role?: unknown; companyId?: unknown }): Promise<Contact> {
    const name = cleanText(input.name, 'The contact name')
    const email = cleanText(input.email, 'The email', 160, false)
    if (email !== '' && !isEmail(email)) throw new CrmError('invalid', `${email} is not an email address.`)
    const companyId = typeof input.companyId === 'string' && input.companyId !== '' ? input.companyId : undefined
    if (companyId !== undefined) this.company(companyId)
    if (email !== '' && this.current.contacts.some((contact) => contact.email.toLowerCase() === email.toLowerCase()))
      throw new CrmError('conflict', `${email} is already a contact.`)
    const contact: Contact = {
      id: this.newId('contact'),
      ...(companyId === undefined ? {} : { companyId }),
      name,
      email,
      role: cleanText(input.role, 'The role', 80, false),
    }
    this.current.contacts.push(contact)
    await this.commit()
    return contact
  }

  /**
   * Add contacts from pasted CSV (`name,email,role,company` with an optional header row). A company that is not in the CRM yet is created; a row that
   * cannot be used is skipped and reported with its line number, and the rest are added.
   */
  async importContacts(csv: string): Promise<{ added: number; skipped: readonly string[] }> {
    const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '')
    if (lines.length === 0) throw new CrmError('invalid', 'Paste at least one line: name,email,role,company.')
    if (lines.length > 500) throw new CrmError('invalid', 'Import at most 500 contacts at a time.')
    const skipped: string[] = []
    let added = 0
    for (const [index, line] of lines.entries()) {
      const cells = line.split(',').map((cell) => cell.trim())
      if (index === 0 && cells[0]?.toLowerCase() === 'name') continue
      try {
        let companyId: string | undefined
        const companyName = cells[3] ?? ''
        if (companyName !== '') {
          const existing = this.current.companies.find((company) => company.name.toLowerCase() === companyName.toLowerCase())
          companyId = existing?.id ?? (await this.createCompany({ name: companyName })).id
        }
        await this.createContact({ name: cells[0], email: cells[1], role: cells[2], companyId })
        added += 1
      } catch (error) {
        if (!(error instanceof CrmError)) throw error
        skipped.push(`Line ${index + 1}: ${error.message}`)
      }
    }
    return { added, skipped }
  }

  async createDeal(input: {
    companyId: unknown
    title: unknown
    value: unknown
    closeDate: unknown
    contactId?: unknown
    ownerId?: unknown
    stage?: unknown
  }): Promise<Deal> {
    const companyId = typeof input.companyId === 'string' ? input.companyId : ''
    if (companyId === '') throw new CrmError('invalid', 'Pick a company for the deal.')
    this.company(companyId)
    const stage = (typeof input.stage === 'string' && input.stage !== '' ? input.stage : 'qualified') as Stage
    if (!(OPEN_STAGES as readonly string[]).includes(stage)) throw new CrmError('invalid', 'A new deal starts in Qualified, Proposal or Negotiation.')
    const contactId = typeof input.contactId === 'string' && input.contactId !== '' ? input.contactId : undefined
    if (contactId !== undefined) this.checkContact(contactId, companyId)
    const ownerId = typeof input.ownerId === 'string' && input.ownerId !== '' ? input.ownerId : undefined
    if (ownerId !== undefined && this.owner(ownerId) === undefined) throw new CrmError('invalid', 'That owner is not in the team.')
    const deal: Deal = {
      id: this.newId('deal'),
      companyId,
      ...(contactId === undefined ? {} : { contactId }),
      title: cleanText(input.title, 'The deal title'),
      value: cleanValue(input.value),
      currency: 'EUR',
      stage,
      probability: STAGE_PROBABILITY[stage],
      ...(ownerId === undefined ? {} : { ownerId }),
      closeDate: cleanDay(input.closeDate, 'The close date'),
    }
    this.current.deals.push(deal)
    this.log(deal.id, 'note', 'Deal created', ownerId)
    await this.commit()
    return deal
  }

  private checkContact(contactId: string, companyId: string): void {
    const contact = this.contact(contactId)
    if (contact.companyId !== undefined && contact.companyId !== companyId)
      throw new CrmError('invalid', `${contact.name} works at another company; pick a contact of this deal's company.`)
  }

  private replaceDeal(id: string, change: Partial<Deal>, drop: readonly (keyof Deal)[] = []): Deal {
    const index = this.current.deals.findIndex((deal) => deal.id === id)
    const next: Record<string, unknown> = { ...(this.current.deals[index] as Deal), ...change }
    for (const key of drop) delete next[key]
    this.current.deals[index] = next as unknown as Deal
    return next as unknown as Deal
  }

  private log(dealId: string, type: ActivityType, body: string, ownerId?: string): Activity {
    const activity: Activity = { id: this.newId('activity'), dealId, type, body, at: this.now, ...(ownerId === undefined ? {} : { ownerId }) }
    this.current.activities.push(activity)
    return activity
  }

  /**
   * Move a deal to another open stage (and give it that stage's usual probability). Closing a deal as won or lost is {@link closeDeal}, which asks for
   * its confirmation; a closed deal can be moved back to an open stage to reopen it.
   */
  async moveDeal(id: string, stage: unknown): Promise<Deal> {
    const deal = this.deal(id)
    if (typeof stage !== 'string' || !(OPEN_STAGES as readonly string[]).includes(stage))
      throw new CrmError('invalid', 'Won and lost are set with the confirmation on the deal.')
    if (deal.stage === stage) return deal
    const wasClosed = !isOpen(deal.stage)
    const moved = this.replaceDeal(id, { stage: stage as Stage, probability: STAGE_PROBABILITY[stage as Stage] }, wasClosed ? ['lostReason'] : [])
    this.log(id, 'stage', `${wasClosed ? 'Reopened' : 'Moved'} from ${STAGE_LABEL[deal.stage]} to ${STAGE_LABEL[stage as Stage]}`, deal.ownerId)
    await this.commit()
    return moved
  }

  /** Mark a deal won or lost; it must be confirmed, and a lost deal needs a reason. The close date becomes today. */
  async closeDeal(id: string, outcome: unknown, confirmed: unknown, reason?: unknown): Promise<Deal> {
    const deal = this.deal(id)
    if (outcome !== 'won' && outcome !== 'lost') throw new CrmError('invalid', 'A deal closes as won or lost.')
    if (!isOpen(deal.stage)) throw new CrmError('conflict', `This deal is already ${STAGE_LABEL[deal.stage].toLowerCase()}.`)
    if (confirmed !== 'yes') throw new CrmError('invalid', `Confirm that the deal is ${outcome}.`)
    const why = outcome === 'lost' ? cleanText(reason, 'The reason it was lost', 200) : ''
    const closed = this.replaceDeal(id, {
      stage: outcome,
      probability: STAGE_PROBABILITY[outcome],
      closeDate: this.today,
      ...(outcome === 'lost' ? { lostReason: why } : {}),
    })
    // The open follow-ups of a closed deal are done with it.
    this.current.tasks = this.current.tasks.map((task) => (task.dealId === id && task.status === 'open' ? { ...task, status: 'done' as const } : task))
    this.log(id, 'stage', outcome === 'won' ? 'Marked won' : `Marked lost: ${why}`, deal.ownerId)
    await this.commit()
    return closed
  }

  async assignOwner(id: string, ownerId: unknown): Promise<Deal> {
    this.deal(id)
    const owner = typeof ownerId === 'string' && ownerId !== '' ? ownerId : undefined
    if (owner !== undefined && this.owner(owner) === undefined) throw new CrmError('invalid', 'That owner is not in the team.')
    const next = owner === undefined ? this.replaceDeal(id, {}, ['ownerId']) : this.replaceDeal(id, { ownerId: owner })
    this.log(id, 'note', owner === undefined ? 'Owner removed' : `Assigned to ${this.owner(owner)?.name}`, owner)
    await this.commit()
    return next
  }

  async setCloseDate(id: string, closeDate: unknown): Promise<Deal> {
    this.deal(id)
    const next = this.replaceDeal(id, { closeDate: cleanDay(closeDate, 'The close date') })
    await this.commit()
    return next
  }

  async setContact(id: string, contactId: unknown): Promise<Deal> {
    const deal = this.deal(id)
    const wanted = typeof contactId === 'string' && contactId !== '' ? contactId : undefined
    if (wanted !== undefined) this.checkContact(wanted, deal.companyId)
    const next = wanted === undefined ? this.replaceDeal(id, {}, ['contactId']) : this.replaceDeal(id, { contactId: wanted })
    await this.commit()
    return next
  }

  async logActivity(dealId: string, input: { type: unknown; body: unknown }): Promise<Activity> {
    const deal = this.deal(dealId)
    const type = input.type as ActivityType
    if (!(['call', 'email', 'meeting', 'note'] as const).includes(type as 'call')) throw new CrmError('invalid', 'Log a call, email, meeting or note.')
    const activity = this.log(dealId, type, cleanText(input.body, 'The activity text', 300), deal.ownerId)
    await this.commit()
    return activity
  }

  /** Set the deal's next action; the open one it replaces is marked done, so a deal has one. */
  async setNextAction(dealId: string, input: { title: unknown; dueAt: unknown; channel?: unknown }): Promise<Task> {
    this.deal(dealId)
    const channel = (typeof input.channel === 'string' && input.channel !== '' ? input.channel : 'Email') as Channel
    if (!CHANNELS.includes(channel)) throw new CrmError('invalid', 'The channel is Email, Call or Meeting.')
    const task: Task = {
      id: this.newId('task'),
      dealId,
      title: cleanText(input.title, 'The next action'),
      channel,
      dueAt: cleanStamp(input.dueAt, 'The due date'),
      status: 'open',
    }
    this.current.tasks = this.current.tasks.map((existing) => (existing.dealId === dealId && existing.status === 'open' ? { ...existing, status: 'done' as const } : existing))
    this.current.tasks.push(task)
    await this.commit()
    return task
  }

  async completeTask(taskId: string): Promise<Task> {
    const index = this.current.tasks.findIndex((task) => task.id === taskId)
    if (index < 0) throw new CrmError('not-found', 'That follow-up does not exist.')
    const task = this.current.tasks[index] as Task
    if (task.status === 'done') return task
    const done = { ...task, status: 'done' as const }
    this.current.tasks[index] = done
    this.log(task.dealId, 'note', `Done: ${task.title}`, this.deal(task.dealId).ownerId)
    await this.commit()
    return done
  }
}
