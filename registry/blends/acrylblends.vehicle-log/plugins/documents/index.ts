/** Documents at `/documents`: the registration and the masked VIN, with the privacy note. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Garage } from '../garage/index.ts'
import type { Shell } from '../garage-shell/index.ts'

export const name = 'documents'
export const inject = ['garage', 'shell', 'router']

export function apply(ctx: Context): void {
  const { garage, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix
  const vehicle = () => garage.vehicle()
  const app = new Acryl().get('/documents', (c) => {
    const current = vehicle()
    const main = `<div class="head"><div><small>GARAGE / DOCUMENTS</small><h1>Vehicle documents</h1><p>The registration and identity kept with the logbook.</p></div></div><section class="panel" style="margin-top:16px"><div class="ph"><h3>Registration</h3></div><div style="padding:4px 16px 12px"><div class="bill"><span>Registration</span><b>${e(current.registration)}</b></div><div class="bill"><span>VIN</span><b>${e(current.vinMasked)}</b></div><div class="bill"><span>Make and model</span><b>${e(current.make)} ${e(current.model)}</b></div><div class="bill"><span>First registered</span><b>${String(current.year)}</b></div></div></section><p style="font-size:9px;color:#87949a;margin-top:12px">The VIN is masked by default. This demo keeps no uploaded scans or live registry checks; inspection and insurance dates are reminders, not regulatory claims.</p>`
    return c.html(shell.page({ active: 'documents', title: 'Documents', main }))
  })
  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'documents', label: 'Documents', icon: '', path: '/documents', order: 40 }))
}
