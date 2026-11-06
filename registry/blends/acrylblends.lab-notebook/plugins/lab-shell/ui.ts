/** The pieces every page draws the same way: the measurement cards, the bar chart, the unit converter, the metadata card and the stamps. */
import { convert, formatNumber, sizeText, stampText, type Attachment, type Experiment, type Lab, type Measurement, type Unit } from '../lab/index.ts'
import { escapeHtml } from './core.ts'

const FIBRE: Record<string, string> = { A: '0% fibre', B: '10% fibre', C: '20% fibre' }

export function pageHead(input: { kicker: string; title: string; text: string; action?: string }): string {
  return `<div class="pagehead"><div><small>${escapeHtml(input.kicker)}</small><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.text)}</p></div>${input.action ?? ''}</div>`
}

export function measurements(lab: Lab, experiment: Experiment, href: (path: string) => string): string {
  const averages = lab.averages(experiment.id)
  const cards = averages
    .map(
      (measurement) =>
        `<div><small>FORMULATION ${escapeHtml(measurement.formulation)}</small><b>${formatNumber(measurement.value)}</b><em>${escapeHtml(measurement.unit)} · ${escapeHtml(FIBRE[measurement.formulation] ?? measurement.formulation)}</em></div>`,
    )
    .join('')
  return `<div class="measure">${cards}</div>`
}

export function chart(lab: Lab, experiment: Experiment): string {
  const averages = lab.averages(experiment.id)
  const baseline = 125
  const scale = 1.54
  const rects: string[] = []
  const labels: string[] = []
  averages.forEach((measurement, index) => {
    const height = Math.round(measurement.value * scale)
    const x = 100 + index * 155
    rects.push(`<rect x="${String(x)}" y="${String(baseline - height)}" width="68" height="${String(height)}" rx="3"/>`)
    labels.push(
      `<text x="${String(x + 34)}" y="${String(baseline - height - 9)}">${formatNumber(measurement.value)}</text><text x="${String(x + 34)}" y="143">${escapeHtml(measurement.formulation)} · ${escapeHtml((FIBRE[measurement.formulation] ?? '').replace(' fibre', ''))}</text>`,
    )
  })
  return `<div class="chartbox"><div style="display:flex;justify-content:space-between;color:#7c939a;font-size:8px"><span>MEAN TENSILE STRENGTH</span><span>MPa</span></div><svg viewBox="0 0 580 150" preserveAspectRatio="none"><g stroke="#dce7e9"><path d="M30 20H570M30 55H570M30 90H570M30 125H570"/></g><g fill="#78aebb">${rects.join('')}</g><g fill="#527783" font-size="10" text-anchor="middle">${labels.join('')}</g></svg></div>`
}

export interface ConverterState {
  readonly value: string
  readonly from: Unit
  readonly to: Unit
  readonly result: string
  readonly error?: string
}

/** The initial converter: the C series average and its exact psi equivalent. */
export function initialConverter(lab: Lab, experiment: Experiment): ConverterState {
  const average = lab.averages(experiment.id).find((measurement) => measurement.formulation === 'C') ?? lab.averages(experiment.id)[0]
  const value = average?.value ?? 58.3972
  return {
    value: formatNumber(value),
    from: 'MPa',
    to: 'psi',
    result: `${formatNumber(value)} MPa = ${formatNumber(convert(value, 'MPa', 'psi'))} psi`,
  }
}

export function converterCard(state: ConverterState, experiment: Experiment, href: (path: string) => string): string {
  return `<section class="card"><h3>Unit converter</h3>${state.error === undefined ? '' : `<p class="notice error" role="alert">${escapeHtml(state.error)}</p>`}<form method="post" action="${href('/convert')}"><input type="hidden" name="experimentId" value="${escapeHtml(experiment.id)}"><label>VALUE</label><input name="value" type="number" step="any" value="${escapeHtml(state.value)}"><label>FROM</label><select name="from">${['MPa', 'bar', 'psi'].map((unit) => `<option${unit === state.from ? ' selected' : ''}>${unit}</option>`).join('')}</select><label>TO</label><select name="to">${['psi', 'MPa', 'bar'].map((unit) => `<option${unit === state.to ? ' selected' : ''}>${unit}</option>`).join('')}</select><button type="submit">Convert measurement</button></form><div class="result">${escapeHtml(state.result)}</div></section>`
}

export function metadataCard(lab: Lab, experiment: Experiment, href: (path: string) => string): string {
  const instrument = lab.instrument(experiment.instrumentId)
  const attachments = lab.attachments(experiment.id)
  const images = attachments.filter((attachment) => attachment.kind === 'image').length
  const csv = attachments.filter((attachment) => attachment.kind === 'csv').length
  return `<section class="card"><h3>Experiment metadata</h3><label>INSTRUMENT</label><b style="font-size:10px">${escapeHtml(instrument?.name ?? 'Not set')}</b><label>LOCATION</label><b style="font-size:10px">${escapeHtml(experiment.location)}</b><label>ATTACHMENTS</label><p style="font-size:9px;color:#789098">${String(attachments.length)} files · ${String(images)} images · ${String(csv)} CSV</p><a href="${href(`/experiments/${encodeURIComponent(experiment.id)}/attachments`)}" style="display:block;text-align:center;background:#e3eff2;color:#286678;border-radius:4px;padding:8px 10px;font-size:9px">View attachments</a></section>`
}

export function reproducibilityCard(): string {
  return `<section class="card"><h3>Reproducibility</h3><p style="font-size:9px;color:#83959c;line-height:1.5">Protocol, instrument, conditions and sample IDs are recorded with every observation.</p><span class="stamp">RECORD COMPLETE</span></section>`
}

export function observationHtml(observation: { author: string; body: string; createdAt: string }): string {
  return `<div class="obs"><time>${escapeHtml(stampText(observation.createdAt))} · ${escapeHtml(observation.author.toUpperCase())}</time><p>${escapeHtml(observation.body)}</p></div>`
}

export function attachmentHtml(attachment: Attachment): string {
  const glyph = attachment.kind === 'csv' ? 'CSV' : attachment.kind === 'image' ? 'IMG' : 'DOC'
  return `<div class="attachment"><span class="glyph">${glyph}</span><div><b>${escapeHtml(attachment.filename)}</b><small>${escapeHtml(attachment.mimeType)} · added ${escapeHtml(stampText(attachment.addedAt))}</small></div><span class="size">${sizeText(attachment.sizeBytes)}</span></div>`
}

export function statusStamp(status: Experiment['status']): string {
  if (status === 'in-progress') return '<span class="stamp">IN PROGRESS</span>'
  if (status === 'complete') return '<span class="stamp">COMPLETE</span>'
  return '<span class="stamp grey">PLANNED</span>'
}

/** The 01 / OBJECTIVE etc. heading. */
export function sectionTitle(index: number, title: string): string {
  return `<h3>${String(index).padStart(2, '0')} / ${escapeHtml(title)}</h3>`
}

/** Not used by a page yet, kept for the data table's formulation labels. */
export function formulationLabel(formulation: string): string {
  return FIBRE[formulation] ?? formulation
}

export function averageRowsFrom(lab: Lab, experiment: Experiment): Measurement[] {
  return lab.averages(experiment.id)
}
