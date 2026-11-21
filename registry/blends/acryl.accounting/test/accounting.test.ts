import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '@acryldev/instance'
import { type App, createApp } from '../src/app.ts'

/** Throwaway homes live inside the project (`.acrylblends/` is ignored by git): a sandboxed agent may not write to the system temp folder. */
const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

async function withHome(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(scratch, 'accounting-'))
  try {
    await run(home)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}
async function withApp(home: string, run: (app: App) => Promise<void>) {
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), { listen: false })
  try {
    await run(app)
  } finally {
    await app.stop()
  }
}
const send = (app: App, path: string, payload?: unknown) =>
  app.root.router.request(`/accounting/${path}`, payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
const json = async <T>(response: Response) => (await response.json()) as T

test('the books are on the first screen', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const html = await (await app.root.router.request('/', { headers: { accept: 'text/html' } })).text()
      assert.ok(html.includes('data-test="accounting"'))
      assert.ok(html.includes('VAT &amp; income'))
    })))

test('an invoice is created with its VAT, shown overdue after its due day, and marked paid once', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const created = await send(app, 'invoice', { client: 'ACME', description: 'Consulting', unitPrice: '1000', quantity: 2, vatRate: 20, issued: '2020-01-10', dueDays: 14 })
      assert.equal(created.status, 200)
      const view = await json<{ invoices: { id: number; number: string; net: number; vat: number; gross: number; overdue: boolean }[] }>(created)
      assert.deepEqual(view.invoices.map((i) => [i.number, i.net, i.vat, i.gross, i.overdue]), [['2020-0001', 200000, 40000, 240000, true]])
      const bad = await send(app, 'invoice', { client: '', description: 'x', unitPrice: '5' })
      assert.equal(bad.status, 422)
      assert.match((await json<{ error: string }>(bad)).error, /client/u)
      assert.equal((await send(app, 'invoice-paid', { id: 1, paidOn: '2020-02-01' })).status, 200)
      const again = await send(app, 'invoice-paid', { id: 1 })
      assert.equal(again.status, 422)
      assert.match((await json<{ error: string }>(again)).error, /already paid/u)
      const open = await json<unknown[]>(await send(app, 'invoices?status=open'))
      assert.deepEqual(open, [])
      assert.equal((await send(app, 'invoices?status=nonsense')).status, 422)
    })))

test('expenses and the VAT summary: output VAT minus input VAT, for a quarter, a month, a year and a from-to range', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      await send(app, 'invoice', { client: 'ACME', description: 'Work', unitPrice: '1000', vatRate: 20, issued: '2026-08-05' })
      const expense = await send(app, 'expense', { description: 'Laptop', amount: '120', vatRate: 20, category: 'equipment', date: '2026-08-10' })
      assert.equal(expense.status, 200)
      assert.equal((await send(app, 'expense', { description: 'Nothing', amount: '0' })).status, 422)
      const quarter = await json<{ revenue: number; outputVat: number; inputVat: number; vatPayable: number; profit: number }>(await send(app, 'summary?period=2026-Q3'))
      assert.deepEqual([quarter.revenue, quarter.outputVat, quarter.inputVat, quarter.vatPayable, quarter.profit], [100000, 20000, 2000, 18000, 90000])
      for (const period of ['2026-08', '2026']) assert.equal((await json<{ vatPayable: number }>(await send(app, `summary?period=${period}`))).vatPayable, 18000)
      assert.equal((await json<{ expenses: number }>(await send(app, 'summary?from=2026-08-11&to=2026-08-31'))).expenses, 0)
      assert.equal((await send(app, 'summary?period=soon')).status, 422)
      assert.deepEqual((await json<{ description: string }[]>(await send(app, 'expenses?from=2026-08-01&to=2026-08-31'))).map((x) => x.description), ['Laptop'])
    })))

test('the books survive a restart', () =>
  withHome(async (home) => {
    await withApp(home, async (app) => { await send(app, 'expense', { description: 'Remember me', amount: '10' }) })
    await withApp(home, async (app) => {
      const view = await json<{ expenses: { description: string }[] }>(await send(app, 'state'))
      assert.deepEqual(view.expenses.map((x) => x.description), ['Remember me'])
      assert.deepEqual(app.root.home.widgets().map((widget) => widget.id), ['accounting'])
    })
  }))
