import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
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
  const home = await mkdtemp(join(scratch, 'orderdesk-'))
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
  app.root.router.request(`/orderdesk/${path}`, payload === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
type View = {
  orders: { id: number; number: string; stage: string }[]
  emails: { id: number; status: string }[]
  products: { sku: string; onHand: number; reserved: number }[]
  outbox: { kind: string; to: { email: string } }[]
  pipeline: { inbox: unknown[]; approval: unknown[]; ready: unknown[]; backorder: unknown[]; shipped: unknown[] }
  stats: { newEmails: number; toApprove: number }
}
const view = async (response: Response) => (await response.json()) as View

test('the first screen is the desk: the starter\'s own React UI, with React 18 served by the app; other clients still get the JSON hello', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const page = await app.root.router.request('/', { headers: { accept: 'text/html' } })
      const html = await page.text()
      assert.match(page.headers.get('content-type') ?? '', /text\/html/u)
      assert.ok(html.includes('id="orderdesk-root"'))
      for (const src of ['orderdesk/assets/vendor/react.js', 'orderdesk/assets/vendor/react-dom.js', 'orderdesk/assets/client.js']) {
        assert.ok(html.includes(`src="${src}"`), src)
        const asset = await app.root.router.request(`/${src}`)
        assert.equal(asset.status, 200, src)
        assert.match(asset.headers.get('content-type') ?? '', /javascript/u)
      }
      const client = await (await app.root.router.request('/orderdesk/assets/client.js')).text()
      assert.ok(client.includes('Delivery note') || client.includes('odk-'), 'the starter\'s own UI')
      assert.ok(!client.includes('__ModuleLoader__') && !client.includes('acryl-app-shell/client') && !client.includes("fetch('/api/"), 'no DSH integration is left in it')
      assert.deepEqual(await (await app.root.router.request('/')).json(), { app: app.root.get('appInstance')?.name, ok: true })
      assert.ok(existsSync(join(home, 'inbox', 'README.md')), 'the drop folder is made')
      assert.equal((await view(await app.root.router.request('/orderdesk/state'))).stats.newEmails, 0)
    })))

test('the sample business: an email becomes an order that reserves stock, ships with a delivery note, and tells the customer', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const loaded = await view(await send(app, 'sample', {}))
      assert.equal(loaded.stats.newEmails, 4)
      assert.equal((await send(app, 'sample', {})).status, 422, 'the sample loads into an empty desk only')
      const ordered = await view(await send(app, 'order', { emailId: 1, lines: 'ESP-1K x6, FIL-1K x2' }))
      const order = ordered.orders.at(-1)
      assert.equal(order?.stage, 'ready')
      assert.equal(ordered.products.find((p) => p.sku === 'ESP-1K')?.reserved, 6)
      assert.ok(ordered.outbox.some((m) => m.kind === 'confirmation' && m.to.email === 'maria@cafe-lindengasse.example'))
      const shipped = await view(await send(app, 'order-ship', { id: order?.id }))
      assert.equal(shipped.orders.at(-1)?.stage, 'shipped')
      assert.equal(shipped.products.find((p) => p.sku === 'ESP-1K')?.onHand, 24)
      const note = await app.root.router.request(`/orderdesk/document?order=${String(order?.id)}`)
      assert.equal(note.status, 200)
      assert.match(await note.text(), /DN-/u)
      assert.ok(readdirSync(join(home, 'delivery-notes')).some((name) => name.startsWith('DN-')), 'the delivery note is a file')
      assert.ok(readdirSync(join(home, 'outbox')).some((name) => name.endsWith('.eml')), 'every message is an .eml file')
      assert.equal((await app.root.router.request('/orderdesk/document?order=999')).status, 422)
    })))

test('a large order waits for approval; stock that arrives releases a backorder; a refusal speaks plainly', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      await send(app, 'sample', {})
      const big = await view(await send(app, 'order', { emailId: 2, lines: 'ESP-1K x30, CUP-6 x8' }))
      assert.equal(big.orders.at(-1)?.stage, 'approval')
      assert.equal(big.pipeline.approval.length, 1)
      assert.equal((await send(app, 'order-ship', { id: big.orders.at(-1)?.id })).status, 422, 'not before it is approved')
      const approved = await view(await send(app, 'order-approve', { id: big.orders.at(-1)?.id }))
      assert.equal(approved.orders.at(-1)?.stage, 'ready')
      const back = await view(await send(app, 'order', { emailId: 4, lines: 'DEC-1K x5' }))
      assert.equal(back.orders.at(-1)?.stage, 'backorder')
      const stocked = await view(await send(app, 'stock-receive', { sku: 'DEC-1K', qty: 20 }))
      assert.equal(stocked.orders.find((o) => o.id === back.orders.at(-1)?.id)?.stage, 'ready')
      const unknown = await send(app, 'order', { customerEmail: 'a@b.example', lines: 'NOPE x1' })
      assert.equal(unknown.status, 422)
      assert.match(((await unknown.json()) as { error: string }).error, /there is no product NOPE/u)
      assert.equal((await send(app, 'order-cancel', { id: 12345 })).status, 422)
    })))

test('emails: pasted, answered, ignored; an email file dropped into inbox/ is imported and moved away', () =>
  withHome((home) =>
    withApp(home, async (app) => {
      const pasted = await view(await send(app, 'email', { from: 'Ann <ann@shop.example>', subject: 'Question', body: 'Do you ship to Graz?' }))
      assert.equal(pasted.stats.newEmails, 1)
      const answered = await view(await send(app, 'email-reply', { emailId: 1, text: 'Yes, we do.' }))
      assert.equal(answered.emails[0]?.status, 'answered')
      assert.ok(answered.outbox.some((m) => m.kind === 'reply'))
      assert.equal((await send(app, 'email-ignore', { id: 1 })).status, 422, 'already handled')
      assert.equal((await send(app, 'email', { from: 'nobody', body: '' })).status, 422)
      writeFileSync(join(home, 'inbox', 'dropped.eml'), 'From: Bo <bo@shop.example>\nSubject: Dropped\n\nPlease call me.\n')
    }),
  ).then(() =>
    // A second start reads the folder once, at start (the sweep also runs on a timer while the app runs).
    withHome(async (home) => {
      mkdirSync(join(home, 'inbox'), { recursive: true })
      writeFileSync(join(home, 'inbox', 'dropped.eml'), 'From: Bo <bo@shop.example>\nSubject: Dropped\n\nPlease call me.\n')
      await withApp(home, async (app) => {
        assert.equal((await view(await send(app, 'state', undefined))).stats.newEmails, 1)
        assert.ok(existsSync(join(home, 'inbox', 'imported', 'dropped.eml')))
      })
    }),
  ))

test('the desk survives a restart', () =>
  withHome(async (home) => {
    await withApp(home, async (app) => { await send(app, 'product', { sku: 'TEA-250', name: 'Tea', price: '12.50', stock: 5 }) })
    await withApp(home, async (app) => {
      const state = await view(await app.root.router.request('/orderdesk/state'))
      assert.deepEqual(state.products.map((p) => p.sku), ['TEA-250'])
    })
  }))
