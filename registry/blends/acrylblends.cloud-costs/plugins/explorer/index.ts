/**
 * The cost explorer and the billing import: filter the cost lines by provider, service and text; import a provider's CSV export with its history and
 * the duplicate state.
 *
 * Routes (under the shell's prefix): GET /explorer?provider&service&q, GET /imports, POST /imports.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { euro, FinopsError, monthOf, number, percent, whenText } from '../finops/index.ts'

export const name = 'explorer'
export const inject = ['finops', 'shell', 'router']

const FILE_SCRIPT = `<script>
(function () {
  var picker = document.getElementById('billingfile');
  var text = document.getElementById('billingtext');
  if (!picker || !text) return;
  picker.addEventListener('change', function () {
    var file = picker.files && picker.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      text.value = String(reader.result || '');
      if (window.acrylToast) window.acrylToast(file.name + ' read');
    };
    reader.readAsText(file);
  });
})();
</script>`

const providerMark = (sourceType: string): string => (sourceType === 'aws' ? 'aws' : sourceType === 'gcp' ? 'G' : 'A')
const providerTint = (sourceType: string): string => (sourceType === 'aws' ? 'aws' : sourceType === 'gcp' ? 'gcp' : 'az')

export function apply(ctx: Context): void {
  const { finops, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const explore = (read: (name: string) => string | undefined): string => {
    const providerId = read('provider') ?? ''
    const service = read('service') ?? ''
    const q = (read('q') ?? '').slice(0, 120)
    const lines = finops.costs({ providerId: providerId === '' ? undefined : providerId, service: service === '' ? undefined : service, q })
    const total = lines.reduce((sum, line) => sum + line.amount, 0)
    const services = [...new Set(finops.costs({ month: finops.month }).map((line) => line.service))].sort()
    const rows = lines.slice(0, 200).map((line) => {
      const provider = finops.provider(line.providerId)
      return `<tr><td>${e(line.day)}</td><td><b>${e(line.service)}</b></td><td><i class="${providerTint(provider?.sourceType ?? 'aws')}">${providerMark(provider?.sourceType ?? 'aws')}</i></td><td>${e(line.account)}</td><td>${e(line.region)}</td><td>${euro(line.amount)}</td></tr>`
    }).join('')
    const byProvider = finops.providers().map((provider) => {
      const amount = lines.filter((line) => line.providerId === provider.id).reduce((sum, line) => sum + line.amount, 0)
      return `<div class="f-provider"><i class="${providerTint(provider.sourceType)}">${providerMark(provider.sourceType)}</i><span>${e(provider.name)}<small>${percent(100 * amount / Math.max(1, total))} of the filtered spend</small></span><b>${euro(amount)}</b></div>`
    }).join('')
    return `<header><div><small>FINANCE / COST EXPLORER</small><h1>Cost explorer</h1><p>${number(lines.length)} cost lines · ${euro(total)} filtered</p></div></header><form class="f-form" method="get" action="${shell.href('/explorer')}"><div class="row"><label>PROVIDER<select name="provider"><option value="">All providers</option>${finops.providers().map((provider) => `<option value="${e(provider.id)}"${provider.id === providerId ? ' selected' : ''}>${e(provider.name)}</option>`).join('')}</select></label><label>SERVICE<select name="service"><option value="">All services</option>${services.map((name) => `<option${name === service ? ' selected' : ''}>${e(name)}</option>`).join('')}</select></label></div><label>SEARCH<input name="q" value="${e(q)}" placeholder="Account, region or day"></label><div class="actions"><button class="primary">Filter</button><a href="${shell.href('/explorer')}">Clear</a></div></form><section class="f-section"><header><b>Spend by provider</b><small>Filtered lines</small></header><div style="padding:8px 15px">${byProvider}</div></section><section class="f-section"><header><b>Cost lines</b><small>Latest first, up to 200</small></header><table><thead><tr><th>DAY</th><th>SERVICE</th><th>PROVIDER</th><th>ACCOUNT</th><th>REGION</th><th>AMOUNT</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="6">No lines match.</td></tr>' : rows}</tbody></table></section>`
  }

  const imports = (values: { providerId?: string; fileName?: string; text?: string }, error?: string, ok?: string): string => {
    const providers = finops.providers().filter((provider) => provider.sourceType !== 'azure')
    const rows = finops.imports().map((item) => {
      const provider = finops.provider(item.providerId)
      return `<tr><td>${e(item.fileName)}</td><td>${e(provider?.name ?? '')}</td><td>${e(item.period)}</td><td>${String(item.lines)}</td><td><span class="f-badge ${item.status}">${e(item.status)}</span></td><td>${e(whenText(item.importedAt, new Date()))}</td></tr>`
    }).join('')
    return `<header><div><small>FINANCE / IMPORTS</small><h1>Import billing data</h1><p>Provider exports in EUR, one billing month per file.</p></div></header>${error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`}${ok === undefined ? '' : `<p class="notice ok" role="status">${e(ok)}</p>`}<form class="f-form" method="post" action="${shell.href('/imports')}"><div class="row"><label>PROVIDER<select name="providerId">${providers.map((provider) => `<option value="${e(provider.id)}"${provider.id === values.providerId ? ' selected' : ''}>${e(provider.name)}</option>`).join('')}</select></label><label>FILE NAME<input name="fileName" maxlength="120" value="${e(values.fileName ?? '')}" placeholder="aws-november-2026.csv"></label></div><label>PICK A FILE<input type="file" id="billingfile" accept=".csv,text/csv,text/plain"></label><label>CSV TEXT<textarea id="billingtext" name="text" required spellcheck="false" placeholder="service,account,region,day,amount,currency&#10;Compute / EC2,prod-aws,eu-central-1,2026-11-01,320.10,EUR">${e(values.text ?? '')}</textarea></label><div class="actions"><button class="primary">Import billing data</button><a href="${shell.href('/costs')}">Cancel</a></div></form><p class="f-note">Columns: service, account, region, day (YYYY-MM-DD), amount and currency. The same file for the same provider and period is recorded as a duplicate and adds nothing.</p><section class="f-section"><header><b>Import history</b><small>${String(finops.imports().length)} files</small></header><table><thead><tr><th>FILE</th><th>PROVIDER</th><th>PERIOD</th><th>LINES</th><th>STATUS</th><th>WHEN</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="6">No imports yet.</td></tr>' : rows}</tbody></table></section>`
  }

  const app = new Acryl()
    .get('/explorer', (c) => c.html(shell.page({ active: 'explorer', title: 'Cost explorer', crumbs: ['Finance', 'Cost explorer'], main: explore((name) => c.req.query(name)) })))
    .get('/imports', (c) => c.html(shell.page({ active: 'imports', title: 'Import billing data', crumbs: ['Finance', 'Imports'], main: imports({}, c.req.query('error'), c.req.query('ok')), scripts: FILE_SCRIPT })))
    .post('/imports', async (c) => {
      const form = await c.req.parseBody()
      try {
        const result = await finops.importBilling(String(form.providerId ?? ''), String(form.fileName ?? ''), String(form.text ?? ''))
        const period = monthOf(result.import.period.length === 7 ? `${result.import.period}-01` : result.import.period)
        return c.redirect(shell.url('/imports', result.duplicate
          ? { kind: 'warn', text: `${result.import.fileName} was imported before for ${period}; it is recorded as a duplicate and added nothing.` }
          : { kind: 'ok', text: `${result.import.fileName} imported: ${number(result.import.lines)} cost lines for ${period}.` }), 303)
      } catch (error) {
        if (!(error instanceof FinopsError)) throw error
        return c.html(shell.page({ active: 'imports', title: 'Import billing data', crumbs: ['Finance', 'Imports'], main: imports({ providerId: String(form.providerId ?? ''), fileName: String(form.fileName ?? ''), text: String(form.text ?? '') }, error.message), scripts: FILE_SCRIPT }))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'explorer', label: 'Cost explorer', icon: '▤', path: '/explorer', order: 20 }))
  ctx.effect(() => shell.nav({ id: 'imports', label: 'Imports', icon: '⌗', path: '/imports', order: 25 }))
}
