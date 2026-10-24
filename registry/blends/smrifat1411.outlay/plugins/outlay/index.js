// outlay (host half): the agent's hands on the books, and the dashboard's API.
// Full CRUD over one append-only file, dynamic categories, and the tools the model calls.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'outlay'
export const inject = ['tools', 'webServer']

export const DEFAULT_CATEGORIES = ['food', 'travel', 'bills', 'shopping', 'health', 'fun', 'other']

const MAX_BODY = 64 * 1024
const MAX_NOTE = 200
const MAX_CATEGORY = 24
const MAX_RECURRING = 20

/** Where the books live: the app's own folder, never the plugin's code folder. */
function homeOf(ctx) {
  return ctx.get('appInstance')?.home ?? process.env.ACRYL_HOME ?? process.cwd()
}
function dataFile(ctx) {
  return join(homeOf(ctx), 'data', 'outlay.jsonl')
}
function categoriesFile(ctx) {
  return join(homeOf(ctx), 'data', 'outlay.categories.json')
}
function budgetsFile(ctx) {
  return join(homeOf(ctx), 'data', 'outlay.budgets.json')
}
function recurringFile(ctx) {
  return join(homeOf(ctx), 'data', 'outlay.recurring.json')
}

function currencyOf(config) {
  const value = config?.currency
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '$'
}

/** Categories are data, not code: the defaults, plus whatever the user or the agent added. */
function readCategories(ctx) {
  const file = categoriesFile(ctx)
  const extra = []
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (Array.isArray(parsed)) for (const item of parsed) if (typeof item === 'string') extra.push(item)
    } catch {
      // A broken categories file falls back to the defaults.
    }
  }
  return [...new Set([...DEFAULT_CATEGORIES, ...extra])]
}

function writeCategories(ctx, categories) {
  const file = categoriesFile(ctx)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(categories, null, 2) + '\n')
}

/** Monthly budget per category: `{ food: 300, travel: 100 }`. Absent file means no budgets. */
function readBudgets(ctx) {
  const file = budgetsFile(ctx)
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const budgets = {}
    for (const [category, amount] of Object.entries(parsed)) {
      const value = Number(amount)
      if (typeof category === 'string' && category !== '' && Number.isFinite(value) && value > 0) {
        budgets[category] = Math.round(value * 100) / 100
      }
    }
    return budgets
  } catch {
    // A broken budgets file means no budgets, never a crash.
    return {}
  }
}

function writeBudgets(ctx, budgets) {
  const file = budgetsFile(ctx)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(budgets, null, 2) + '\n')
}

/** A recurring rule posts itself on its day each month: `{ amount, note, category, day }`. */
function clampDay(value) {
  const day = Math.trunc(Number(value))
  return Number.isFinite(day) ? Math.min(Math.max(day, 1), 31) : 1
}

function readRecurring(ctx) {
  const file = recurringFile(ctx)
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed)) return []
    const rules = []
    for (const rule of parsed) {
      if (rule === null || typeof rule !== 'object' || typeof rule.id !== 'string') continue
      const amount = Number(rule.amount)
      if (!Number.isFinite(amount) || amount <= 0) continue
      rules.push({
        id: rule.id,
        amount: Math.round(amount * 100) / 100,
        note: String(rule.note ?? '').slice(0, MAX_NOTE),
        category: typeof rule.category === 'string' && rule.category !== '' ? rule.category : 'other',
        day: clampDay(rule.day),
        start: typeof rule.start === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(rule.start) ? rule.start : dayKey(new Date()),
        lastPosted: typeof rule.lastPosted === 'string' ? rule.lastPosted : null,
        active: rule.active !== false,
      })
    }
    return rules
  } catch {
    // A broken rules file means no rules, never a crash.
    return []
  }
}

function writeRecurring(ctx, rules) {
  const file = recurringFile(ctx)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(rules, null, 2) + '\n')
}

/** The rule's day in one month, pulled back to that month's last day (31 in February = 28/29). */
function scheduledDay(rule, year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(rule.day, lastDay)).padStart(2, '0')}`
}

/** The first occurrence strictly after today, for display. */
function nextOccurrence(rule, today = dayKey(new Date())) {
  const [year, month] = today.split('-').map(Number)
  let cursor = new Date(year, month - 1, 1)
  for (let step = 0; step < 24; step += 1) {
    const scheduled = scheduledDay(rule, cursor.getFullYear(), cursor.getMonth())
    if (scheduled > today && scheduled >= rule.start) return scheduled
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return null
}

/**
 * Post every occurrence that came due since the last one. Idempotent: an occurrence is skipped
 * when an entry with the same rule id and scheduled date already exists, so reading twice in the
 * same minute cannot double-post, and a deleted occurrence is not brought back.
 */
function postDue(ctx) {
  const rules = readRecurring(ctx)
  if (rules.length === 0) return 0
  const today = dayKey(new Date())
  const entries = readEntries(ctx)
  const seen = new Set()
  for (const entry of entries) {
    if (typeof entry.recurring === 'string' && typeof entry.scheduled === 'string') {
      seen.add(`${entry.recurring}:${entry.scheduled}`)
    }
  }
  let posted = 0
  let changed = false
  const nextRules = rules.map((rule) => {
    if (!rule.active) return rule
    const from = rule.lastPosted ?? rule.start
    const [fromYear, fromMonth] = from.split('-').map(Number)
    if (!Number.isFinite(fromYear) || !Number.isFinite(fromMonth)) return rule
    let cursor = new Date(fromYear, fromMonth - 1, 1)
    let last = rule.lastPosted
    // Walk month by month up to this one; a future day stops the walk.
    while (dayKey(cursor).slice(0, 7) <= today.slice(0, 7)) {
      const scheduled = scheduledDay(rule, cursor.getFullYear(), cursor.getMonth())
      if (scheduled > today) break
      if (scheduled >= rule.start && (last === null || scheduled > last) && !seen.has(`${rule.id}:${scheduled}`)) {
        entries.push({
          id: randomUUID(),
          ts: new Date(`${scheduled}T09:00:00`).toISOString(),
          amount: rule.amount,
          note: rule.note,
          category: rule.category,
          recurring: rule.id,
          scheduled,
        })
        seen.add(`${rule.id}:${scheduled}`)
        posted += 1
      }
      if (scheduled > (last ?? '')) last = scheduled
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    if (last !== rule.lastPosted) {
      changed = true
      return { ...rule, lastPosted: last }
    }
    return rule
  })
  if (posted > 0) writeEntries(ctx, entries)
  if (changed) writeRecurring(ctx, nextRules)
  return posted
}

/** The rules as the dashboard shows them: each one with its next date. */
function recurringRows(ctx) {
  const today = dayKey(new Date())
  return readRecurring(ctx).map(rule => ({ ...rule, next: nextOccurrence(rule, today) }))
}

function slugify(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, MAX_CATEGORY)
}

function readEntries(ctx) {
  const file = dataFile(ctx)
  if (!existsSync(file)) return []
  const entries = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const text = line.trim()
    if (text === '') continue
    try {
      const entry = JSON.parse(text)
      if (typeof entry?.amount === 'number' && entry.amount > 0) {
        if (typeof entry.id !== 'string') entry.id = randomUUID()
        entries.push(entry)
      }
    } catch {
      // A half-written line is skipped, never fatal.
    }
  }
  return entries
}

function writeEntries(ctx, entries) {
  const file = dataFile(ctx)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, entries.map(entry => JSON.stringify(entry)).join('\n') + (entries.length === 0 ? '' : '\n'))
}

function cleanAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number')
  return Math.round(amount * 100) / 100
}

function cleanNote(value) {
  const note = String(value ?? '').trim().slice(0, MAX_NOTE)
  if (note === '') throw new Error('note is required')
  return note
}

function cleanCategory(value, categories) {
  const category = slugify(value ?? '')
  return categories.includes(category) ? category : 'other'
}

function addEntry(ctx, input) {
  const categories = readCategories(ctx)
  const entry = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    amount: cleanAmount(input.amount),
    note: cleanNote(input.note),
    category: cleanCategory(input.category, categories),
  }
  const file = dataFile(ctx)
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(entry)}\n`)
  return entry
}

/** Patch one entry. Any of amount, note, category, and the date part of when. */
function updateEntry(ctx, input) {
  const id = String(input.id ?? '').trim()
  if (id === '') throw new Error('id is required')
  const entries = readEntries(ctx)
  const target = entries.find(entry => entry.id === id || entry.id.startsWith(id))
  if (target === undefined) throw new Error(`no entry matches ${id}`)
  const categories = readCategories(ctx)
  if (input.amount !== undefined) target.amount = cleanAmount(input.amount)
  if (input.note !== undefined) target.note = cleanNote(input.note)
  if (input.category !== undefined) target.category = cleanCategory(input.category, categories)
  if (input.ts !== undefined) {
    const when = new Date(String(input.ts))
    if (Number.isNaN(when.getTime())) throw new Error('ts must be an ISO date')
    target.ts = when.toISOString()
  }
  writeEntries(ctx, entries)
  return target
}

function removeEntry(ctx, id) {
  const entries = readEntries(ctx)
  const next = entries.filter(entry => entry.id !== id && !entry.id.startsWith(String(id)))
  if (next.length === entries.length) throw new Error('no entry with that id')
  writeEntries(ctx, next)
  return next.length
}

function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** One CSV field: quoted only when it must be, with embedded quotes doubled. */
function csvField(value) {
  const text = String(value ?? '')
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text
}

/** The whole books as CSV, oldest first, ready for a spreadsheet. */
function toCsv(entries) {
  const lines = ['id,date,time,amount,category,note']
  const ordered = entries.slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  for (const entry of ordered) {
    const when = new Date(entry.ts ?? Date.now())
    lines.push([
      entry.id,
      dayKey(when),
      when.toTimeString().slice(0, 8),
      Number(entry.amount).toFixed(2),
      entry.category ?? 'other',
      entry.note ?? '',
    ].map(csvField).join(','))
  }
  return `${lines.join('\n')}\n`
}

/** Everything the dashboard reads: totals, per-category, and the last seven days. */
function summary(entries) {
  const now = new Date()
  const today = dayKey(now)
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const weekStart = dayKey(monday)
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const totals = { today: 0, week: 0, month: 0, all: 0, count: entries.length }
  const byCategory = {}
  const monthByCategory = {}
  const byDay = {}
  for (const entry of entries) {
    const key = dayKey(entry.ts ?? Date.now())
    totals.all += entry.amount
    if (key === today) totals.today += entry.amount
    if (key >= weekStart) totals.week += entry.amount
    const isThisMonth = key.startsWith(monthStart)
    if (isThisMonth) totals.month += entry.amount
    const category = typeof entry.category === 'string' && entry.category !== '' ? entry.category : 'other'
    byCategory[category] = (byCategory[category] ?? 0) + entry.amount
    if (isThisMonth) monthByCategory[category] = (monthByCategory[category] ?? 0) + entry.amount
    byDay[key] = (byDay[key] ?? 0) + entry.amount
  }
  const days = []
  for (let back = 6; back >= 0; back -= 1) {
    const d = new Date(now)
    d.setDate(now.getDate() - back)
    const key = dayKey(d)
    days.push({ day: key, amount: byDay[key] ?? 0 })
  }
  return { totals, byCategory, monthByCategory, days }
}

/** The budgets joined to what this month actually spent: one row per budgeted category. */
function budgetRows(ctx, entries) {
  const budgets = readBudgets(ctx)
  const { monthByCategory } = summary(entries)
  return Object.entries(budgets)
    .map(([category, amount]) => {
      const spent = Math.round((monthByCategory[category] ?? 0) * 100) / 100
      return {
        category,
        amount,
        spent,
        remaining: Math.round((amount - spent) * 100) / 100,
        pct: Math.round((spent / amount) * 1000) / 1000,
      }
    })
    .sort((a, b) => b.pct - a.pct)
}

function money(amount, currency) {
  const rounded = Math.round(amount * 100) / 100
  return `${currency}${rounded.toLocaleString('en-US')}`
}

function brief(entries, currency, budgets = []) {
  const { totals, byCategory } = summary(entries)
  const parts = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => `${category} ${money(amount, currency)}`)
  const lines = [
    `Today ${money(totals.today, currency)} | this week ${money(totals.week, currency)} | this month ${money(totals.month, currency)}`,
    parts.length === 0 ? 'No entries yet.' : `By category: ${parts.join(', ')}`,
  ]
  if (budgets.length > 0) {
    const shown = budgets.map((row) => {
      const head = `${row.category} ${money(row.spent, currency)}/${money(row.amount, currency)}`
      return row.remaining < 0 ? `${head} (over by ${money(-row.remaining, currency)})` : `${head} (${Math.round(row.pct * 100)}%)`
    })
    lines.push(`Budgets this month: ${shown.join(', ')}`)
  }
  return lines.join('\n')
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(body)
}

function readJson(req) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) { rejectBody(new Error('body too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolveBody({})
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { rejectBody(new Error('body must be JSON')) }
    })
    req.on('error', rejectBody)
  })
}

/** One shape for every mutation: act, then answer with the whole view. */
function mutate(req, res, reply, action) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
  readJson(req)
    .then((body) => {
      try {
        action(body)
        sendJson(res, 200, reply())
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    })
    .catch(error => sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) }))
}

export function apply(ctx, config) {
  const currency = currencyOf(config)
  const payload = () => {
    postDue(ctx)
    const entries = readEntries(ctx)
    return {
      currency,
      categories: readCategories(ctx),
      entries: entries.slice(-500),
      budgets: budgetRows(ctx, entries),
      recurring: recurringRows(ctx),
      ...summary(entries),
    }
  }
  /** The one-paragraph answer the agent sees after every mutation. */
  const summaryText = () => {
    postDue(ctx)
    const entries = readEntries(ctx)
    return brief(entries, currency, budgetRows(ctx, entries))
  }

  ctx.tools.register(defineTool({
    name: 'outlay_add',
    description: 'Record one expense. Call it once per amount the user mentions (200 taxi and 500 groceries = two calls).',
    parameters: {
      amount: { type: 'number', required: true, description: 'Amount in the app currency, a positive number' },
      note: { type: 'string', required: true, description: 'What it was for, in the user\'s own words' },
      category: { type: 'string', description: 'Category id (see outlay_categories); guess from the note, use other when unsure' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      postDue(ctx)
      const entry = addEntry(ctx, args)
      return `Saved ${money(entry.amount, currency)} (${entry.category}) - ${entry.note}\n${summaryText()}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'outlay_list',
    description: 'Read the books: recent entries with their ids, totals, and the category ids that exist.',
    parameters: {
      limit: { type: 'number', description: 'How many recent entries to show (default 15, max 50)' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      postDue(ctx)
      const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 50)
      const entries = readEntries(ctx)
      const categories = `Categories: ${readCategories(ctx).join(', ')}`
      if (entries.length === 0) return `The books are empty. Tell me an expense and I will add it.\n${categories}`
      const recent = entries.slice(-limit).reverse()
        .map(entry => `${dayKey(entry.ts)}  ${money(entry.amount, currency).padStart(9)}  ${entry.category.padEnd(9)} ${entry.note}  [${entry.id.slice(0, 8)}]`)
      return [brief(entries, currency, budgetRows(ctx, entries)), categories, '', `Last ${recent.length}:`, ...recent].join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'outlay_update',
    description: 'Fix one entry: change its amount, note, category or date. The id is the one outlay_list shows.',
    parameters: {
      id: { type: 'string', required: true, description: 'Entry id, or its first 8 characters' },
      amount: { type: 'number', description: 'New amount' },
      note: { type: 'string', description: 'New note' },
      category: { type: 'string', description: 'New category id' },
      ts: { type: 'string', description: 'New date, ISO format (e.g. 2026-10-19T18:40:00.000Z)' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      postDue(ctx)
      const entry = updateEntry(ctx, args)
      return `Updated: ${money(entry.amount, currency)} (${entry.category}) - ${entry.note}\n${summaryText()}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'outlay_remove',
    description: 'Delete one wrong entry by the id shown in outlay_list (the first 8 characters are enough).',
    parameters: {
      id: { type: 'string', required: true, description: 'The entry id, or its first 8 characters' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      postDue(ctx)
      const id = String(args.id ?? '').trim()
      if (id === '') throw new Error('id is required')
      const match = readEntries(ctx).find(entry => entry.id === id || entry.id.startsWith(id))
      if (match === undefined) throw new Error(`no entry matches ${id}`)
      removeEntry(ctx, match.id)
      return `Removed ${money(match.amount, currency)} (${match.category}) - ${match.note}\n${summaryText()}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'outlay_categories',
    description: 'Manage categories: action "list", "add" with a name, or "remove" with an id (defaults cannot be removed).',
    parameters: {
      action: { type: 'string', required: true, description: 'list | add | remove' },
      name: { type: 'string', description: 'Category name for add' },
      id: { type: 'string', description: 'Category id for remove' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const action = String(args.action ?? 'list')
      const current = readCategories(ctx)
      if (action === 'add') {
        const id = slugify(args.name ?? '')
        if (id === '') throw new Error('name is required')
        if (!current.includes(id)) writeCategories(ctx, [...current, id])
        return `Categories: ${readCategories(ctx).join(', ')}`
      }
      if (action === 'remove') {
        const id = slugify(args.id ?? '')
        if (DEFAULT_CATEGORIES.includes(id)) throw new Error(`${id} is a default category and stays`)
        writeCategories(ctx, current.filter(category => category !== id))
        return `Categories: ${readCategories(ctx).join(', ')}`
      }
      return `Categories: ${current.join(', ')}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'outlay_budget',
    description: 'Monthly budgets per category: action "list" shows each budget and what this month spent of it; "set" needs category and amount; "remove" needs category. Setting a budget to 0 removes it.',
    parameters: {
      action: { type: 'string', required: true, description: 'list | set | remove' },
      category: { type: 'string', description: 'Category id (see outlay_categories)' },
      amount: { type: 'number', description: 'Monthly budget for set, in the app currency' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      postDue(ctx)
      const action = String(args.action ?? 'list')
      const budgets = readBudgets(ctx)
      if (action === 'set') {
        const category = slugify(args.category ?? '')
        const categories = readCategories(ctx)
        if (category === '') throw new Error('category is required')
        if (!categories.includes(category)) throw new Error(`unknown category ${category}; categories: ${categories.join(', ')}`)
        const amount = Number(args.amount)
        if (!Number.isFinite(amount)) throw new Error('amount must be a number')
        if (amount <= 0) delete budgets[category]
        else budgets[category] = Math.round(amount * 100) / 100
        writeBudgets(ctx, budgets)
      } else if (action === 'remove') {
        const category = slugify(args.category ?? '')
        if (category === '') throw new Error('category is required')
        delete budgets[category]
        writeBudgets(ctx, budgets)
      }
      const rows = budgetRows(ctx, readEntries(ctx))
      const unbudgeted = readCategories(ctx).filter(category => !rows.some(row => row.category === category))
      const lines = rows.length === 0
        ? ['No budgets set.']
        : [`Budgets this month (${new Date().toLocaleDateString('en-US', { month: 'long' })}):`].concat(rows.map((row) => {
            const head = `- ${row.category}: spent ${money(row.spent, currency)} of ${money(row.amount, currency)}`
            return row.remaining < 0 ? `${head} - OVER by ${money(-row.remaining, currency)}` : `${head} - ${money(row.remaining, currency)} left (${Math.round(row.pct * 100)}%)`
          }))
      if (unbudgeted.length > 0) lines.push(`No budget: ${unbudgeted.join(', ')}`)
      return lines.join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'outlay_recurring',
    description: 'Recurring monthly expenses (rent, subscriptions): "list" shows the rules and their next date; "add" needs amount, note, category and day of month (1-31, clamped to the month\'s last day); "remove", "pause" or "resume" need the rule id. A rule posts itself on its day, and missed months are caught up the next time the books are read.',
    parameters: {
      action: { type: 'string', required: true, description: 'list | add | remove | pause | resume' },
      amount: { type: 'number', description: 'Monthly amount for add, in the app currency' },
      note: { type: 'string', description: 'What it pays for, e.g. rent' },
      category: { type: 'string', description: 'Category id (see outlay_categories)' },
      day: { type: 'number', description: 'Day of the month to post on for add (default 1)' },
      id: { type: 'string', description: 'Rule id, or its first 8 characters, for remove/pause/resume' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      postDue(ctx)
      const action = String(args.action ?? 'list')
      let rules = readRecurring(ctx)
      if (action === 'add') {
        const categories = readCategories(ctx)
        const category = slugify(args.category ?? '')
        if (category === '') throw new Error('category is required')
        if (!categories.includes(category)) throw new Error(`unknown category ${category}; categories: ${categories.join(', ')}`)
        if (rules.length >= MAX_RECURRING) throw new Error(`too many recurring rules (max ${MAX_RECURRING})`)
        writeRecurring(ctx, [...rules, {
          id: randomUUID(),
          amount: cleanAmount(args.amount),
          note: cleanNote(args.note),
          category,
          day: clampDay(args.day ?? 1),
          start: dayKey(new Date()),
          lastPosted: null,
          active: true,
        }])
        postDue(ctx)
        rules = readRecurring(ctx)
      } else if (action !== 'list') {
        if (action !== 'remove' && action !== 'pause' && action !== 'resume') throw new Error('action must be list, add, remove, pause or resume')
        const id = String(args.id ?? '').trim()
        if (id === '') throw new Error('id is required')
        const match = rules.find(rule => rule.id === id || rule.id.startsWith(id))
        if (match === undefined) throw new Error(`no rule matches ${id}`)
        if (action === 'remove') writeRecurring(ctx, rules.filter(rule => rule.id !== match.id))
        else writeRecurring(ctx, rules.map(rule => (rule.id === match.id ? { ...rule, active: action === 'resume' } : rule)))
        rules = readRecurring(ctx)
      }
      if (rules.length === 0) return 'No recurring expenses yet. Add one with amount, note, category and day.'
      const today = dayKey(new Date())
      const lines = rules.map((rule) => {
        const next = nextOccurrence(rule, today)
        const when = rule.active ? `next ${next ?? 'never'}` : 'paused'
        return `- ${rule.note}: ${money(rule.amount, currency)} on day ${rule.day} (${rule.category}), ${when} [${rule.id.slice(0, 8)}]`
      })
      return ['Recurring monthly:', ...lines].join('\n')
    },
  }))

  /** The budget route: set a category's monthly amount, or delete it. */
  const setBudget = (body) => {
    const budgets = readBudgets(ctx)
    if (body.remove !== undefined) {
      const category = slugify(body.remove)
      delete budgets[category]
      writeBudgets(ctx, budgets)
      return
    }
    const category = slugify(body.category ?? '')
    if (category === '') throw new Error('category is required')
    if (!readCategories(ctx).includes(category)) throw new Error(`unknown category ${category}`)
    const amount = Number(body.amount)
    if (!Number.isFinite(amount)) throw new Error('amount must be a number')
    if (amount <= 0) delete budgets[category]
    else budgets[category] = Math.round(amount * 100) / 100
    writeBudgets(ctx, budgets)
  }

  /** The recurring route: add a rule, remove one, or pause/resume one. */
  const setRecurring = (body) => {
    const rules = readRecurring(ctx)
    if (body.remove !== undefined || body.toggle !== undefined) {
      const id = String(body.remove ?? body.toggle).trim()
      const match = rules.find(rule => rule.id === id || rule.id.startsWith(id))
      if (match === undefined) throw new Error(`no rule matches ${id}`)
      if (body.remove !== undefined) writeRecurring(ctx, rules.filter(rule => rule.id !== match.id))
      else writeRecurring(ctx, rules.map(rule => (rule.id === match.id ? { ...rule, active: !rule.active } : rule)))
      return
    }
    const categories = readCategories(ctx)
    const category = slugify(body.category ?? '')
    if (category === '') throw new Error('category is required')
    if (!categories.includes(category)) throw new Error(`unknown category ${category}`)
    if (rules.length >= MAX_RECURRING) throw new Error(`too many recurring rules (max ${MAX_RECURRING})`)
    writeRecurring(ctx, [...rules, {
      id: randomUUID(),
      amount: cleanAmount(body.amount),
      note: cleanNote(body.note),
      category,
      day: clampDay(body.day ?? 1),
      start: dayKey(new Date()),
      lastPosted: null,
      active: true,
    }])
  }

  const routes = [
    ['/api/outlay/entries', (req, res) => {
      if (req.method === 'GET') return sendJson(res, 200, payload())
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'GET or POST' })
      mutate(req, res, payload, (body) => addEntry(ctx, body))
    }],
    ['/api/outlay/update', (req, res) => mutate(req, res, payload, (body) => updateEntry(ctx, body))],
    ['/api/outlay/delete', (req, res) => mutate(req, res, payload, (body) => removeEntry(ctx, String(body.id ?? '')))],
    ['/api/outlay/category', (req, res) => mutate(req, res, payload, (body) => {
      const current = readCategories(ctx)
      if (body.remove !== undefined) {
        const id = slugify(body.remove)
        if (DEFAULT_CATEGORIES.includes(id)) throw new Error(`${id} is a default category and stays`)
        writeCategories(ctx, current.filter(category => category !== id))
        return
      }
      const id = slugify(body.name ?? body.id ?? '')
      if (id === '') throw new Error('name is required')
      if (!current.includes(id)) writeCategories(ctx, [...current, id])
    })],
    ['/api/outlay/budget', (req, res) => mutate(req, res, payload, setBudget)],
    ['/api/outlay/recurring', (req, res) => mutate(req, res, payload, setRecurring)],
    ['/api/outlay/export.csv', (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' })
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="outlay-${dayKey(new Date())}.csv"`,
        'cache-control': 'no-store',
      })
      res.end(toCsv(readEntries(ctx)))
    }],
  ]

  for (const [path, handler] of routes) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler }), `outlay: ${path}`)
  }
}
