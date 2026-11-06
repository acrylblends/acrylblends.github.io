/**
 * The import page: a CSV pasted into the text area, or picked from the disk and read into it by the browser (nothing is uploaded), with the column
 * profile inferred on save.
 *
 * Routes (under the shell's prefix): GET /import, POST /import.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { number, TablesError } from '../tables/index.ts'

export const name = 'imports'
export const inject = ['tables', 'shell', 'router']

const FILE_SCRIPT = `<script>
(function () {
  var picker = document.getElementById('csvfile');
  var text = document.getElementById('csvtext');
  if (!picker || !text) return;
  picker.addEventListener('change', function () {
    var file = picker.files && picker.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      text.value = String(reader.result || '');
      if (window.acrylToast) window.acrylToast(file.name + ' read: ' + text.value.split('\\n').length + ' lines');
    };
    reader.readAsText(file);
  });
})();
</script>`

export function apply(ctx: Context): void {
  const { tables, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const page = (values: { name?: string; fileName?: string; text?: string }, error?: string, ok?: string): string => {
    const datasets = tables.datasets()
    const list = datasets.map((dataset) => `<tr><td><a href="${shell.href(`/datasets/${encodeURIComponent(dataset.id)}`)}"><b>${e(dataset.name)}</b></a></td><td>${e(dataset.fileName)}</td><td>${number(dataset.rows.length)} rows</td><td>${String(dataset.columns.length)} columns</td></tr>`).join('')
    const main = `<div class="d-page"><header><div><small>WORKSPACE / IMPORTS</small><h1>Import a CSV</h1><p>The file stays on this machine; the columns and their types are read from its first rows.</p></div></header>${error === undefined ? '' : `<p class="notice error" role="alert">${e(error)}</p>`}${ok === undefined ? '' : `<p class="notice ok" role="status">${e(ok)}</p>`}<form class="d-form" method="post" action="${shell.href('/import')}"><div class="row"><label>NAME<input name="name" required maxlength="80" value="${e(values.name ?? '')}" placeholder="Sales Q3 2026"></label><label>FILE NAME<input name="fileName" maxlength="120" value="${e(values.fileName ?? '')}" placeholder="sales_q3_2026.csv"></label></div><label>PICK A FILE<input type="file" id="csvfile" accept=".csv,text/csv,text/plain"></label><label>CSV TEXT<textarea id="csvtext" name="text" required spellcheck="false" placeholder="customer,revenue,region&#10;Alpine Systems,18420,DACH">${e(values.text ?? '')}</textarea></label><div class="actions"><button class="primary">Import dataset</button><a href="${shell.href('/datasets')}">Cancel</a></div></form><section class="d-section"><header><b>Imported datasets</b><small>${String(datasets.length)} files</small></header><table><thead><tr><th>NAME</th><th>FILE</th><th>ROWS</th><th>COLUMNS</th></tr></thead><tbody>${list === '' ? '<tr><td colspan="4">Nothing imported yet.</td></tr>' : list}</tbody></table></section><p class="hint" style="font-size:8px;color:#8a9a9e">A header row is required. Numbers, ISO dates (2026-09-28) and short repeating values are detected; a quoted field may contain commas.</p></div>`
    return shell.page({ active: 'imports', title: 'Import a CSV', crumbs: ['Workspace', 'Imports', 'New'], meta: values.fileName ?? 'No file yet', main, scripts: FILE_SCRIPT })
  }

  const app = new Acryl()
    .get('/import', (c) => c.html(page({}, c.req.query('error'), c.req.query('ok'))))
    .post('/import', async (c) => {
      const form = await c.req.parseBody()
      try {
        const dataset = await tables.createDataset(String(form.name ?? ''), String(form.fileName ?? ''), String(form.text ?? ''))
        return c.redirect(shell.url(`/datasets/${encodeURIComponent(dataset.id)}`, { kind: 'ok', text: `“${dataset.name}” was imported: ${number(dataset.rows.length)} rows, ${String(dataset.columns.length)} columns.` }), 303)
      } catch (error) {
        if (!(error instanceof TablesError)) throw error
        return c.html(page({ name: String(form.name ?? ''), fileName: String(form.fileName ?? ''), text: String(form.text ?? '') }, error.message))
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
  ctx.effect(() => shell.nav({ id: 'imports', label: 'Import', icon: '＋', path: '/import', order: 20 }))
}
