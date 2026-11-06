/**
 * The workbench's drawings as SVG strings: the probe trace chart (one or two runs), the chamber cross-section and the thermal field heat map.
 * Pure: the same run draws the same picture, so the tests can read it.
 */
import type { ParameterSet, TracePoint } from '../morrow-lab/index.ts'

const X0 = 45
const X1 = 680
const Y_TOP = 20
const Y_BASE = 155
/** The chart's temperature scale: 10 °C at the base line, 70 °C at the top grid line, as the mockup's axis reads. */
const T_MIN = 10
const T_MAX = 70

const yOf = (temp: number): number => {
  const clamped = Math.min(T_MAX + 8, Math.max(T_MIN, temp))
  return Y_BASE - ((clamped - T_MIN) / (T_MAX - T_MIN)) * (Y_BASE - Y_TOP)
}

/** The SVG path of a trace over the 20-minute horizon. */
export function tracePath(trace: readonly TracePoint[], horizon = 20): string {
  return trace
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${(X0 + (point.t / horizon) * (X1 - X0)).toFixed(1)} ${yOf(point.temp).toFixed(1)}`)
    .join(' ')
}

export interface Series {
  readonly label: string
  readonly trace: readonly TracePoint[]
  /** `main` is cyan, `compare` amber and dashed. */
  readonly kind: 'main' | 'compare'
}

/** The probe A chart of the mockup's Response traces tab, with up to two runs overlaid. */
export function traceChart(series: readonly Series[]): string {
  const lines = series
    .map(
      (s) =>
        `<path class="curve ${s.kind}" d="${tracePath(s.trace)}" fill="none" stroke="${s.kind === 'main' ? 'var(--cyan)' : 'var(--amber)'}" stroke-width="3"${s.kind === 'compare' ? ' stroke-dasharray="8 6"' : ''}><title>${s.label.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</title></path>`,
    )
    .join('')
  return `<svg viewBox="0 0 700 190" role="img" aria-label="Probe A temperature over 20 minutes"><g stroke="var(--line)" stroke-dasharray="4 4"><path d="M45 20H680M45 65H680M45 110H680"/></g>${lines}<path d="M45 155H680" stroke="#668092"/><g fill="var(--muted)" font-size="10"><text x="12" y="24">70°</text><text x="12" y="69">50°</text><text x="12" y="114">30°</text><text x="45" y="180">0m</text><text x="350" y="180">10m</text><text x="655" y="180">20m</text></g></svg>`
}

/** The colour of a temperature between the run's ambient and peak: teal (cold) to coral to amber (hot). */
export function heatColor(temp: number, low: number, high: number): string {
  const span = high - low
  const f = span <= 0 ? 0 : Math.min(1, Math.max(0, (temp - low) / span))
  const stops = [
    [16, 40, 58],
    [40, 111, 131],
    [236, 118, 94],
    [255, 207, 130],
  ] as const
  const scaled = f * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(scaled))
  const local = scaled - i
  const a = stops[i] ?? stops[0]
  const b = stops[i + 1] ?? stops[3]
  const mix = (n: 0 | 1 | 2) => Math.round(a[n] + (b[n] - a[n]) * local)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

/** The thermal field tab: the chamber with its heat map, the heater panel and the range label. */
export function fieldMap(field: readonly (readonly number[])[], ambient: number, peak: number): string {
  const rows = field.length
  const cols = field[0]?.length ?? 0
  const w = 620 / Math.max(1, cols)
  const h = 350 / Math.max(1, rows)
  const cells = field
    .flatMap((row, r) =>
      row.map(
        (temp, c) =>
          `<rect x="${(40 + c * w).toFixed(2)}" y="${(32 + r * h).toFixed(2)}" width="${(w + 0.6).toFixed(2)}" height="${(h + 0.6).toFixed(2)}" fill="${heatColor(temp, ambient, peak)}"/>`,
      ),
    )
    .join('')
  return `<svg viewBox="0 0 700 430" role="img" aria-label="Thermal field from ${ambient} to ${peak} °C"><defs><filter id="smooth" x="0" y="0" width="1" height="1"><feGaussianBlur stdDeviation="9"/></filter><clipPath id="chamber"><rect x="40" y="32" width="620" height="350" rx="12"/></clipPath></defs><g clip-path="url(#chamber)"><g filter="url(#smooth)">${cells}</g></g><rect x="40" y="32" width="620" height="350" rx="12" fill="none" stroke="#6d98a8" stroke-width="8"/><g fill="#f6f7ef" font-size="13"><text x="60" y="20">T = ${Math.round(ambient)}–${Math.round(peak)} °C · t = 20 min</text><text x="310" y="410">HEATER PANEL</text></g><rect x="315" y="344" width="85" height="28" rx="4" fill="#f3ae6c"/></svg>`
}

/** The setup tab's chamber cross-section: the glow follows the heater, the dashed isotherm rises with the peak, the arrows grow with airflow. */
export function crossSection(p: ParameterSet): string {
  const glow = (0.25 + (p.heater / 100) * 0.7).toFixed(2)
  const lift = Math.round((p.heater / 100) * 60)
  const arrow = 40 + Math.round((p.airflow / 100) * 50)
  const arrows = [130, 300, 420]
    .map((x) => `M${x} 90h${arrow}m-8 -6 8 6 -8 6M${x} 150h${arrow}m-8 -6 8 6 -8 6`)
    .join('')
  return `<svg viewBox="0 0 620 280" preserveAspectRatio="none" role="img" aria-label="Chamber cross-section"><defs><radialGradient id="hot"><stop stop-color="#ffbd75" stop-opacity="${glow}"/><stop offset=".5" stop-color="#ec765e" stop-opacity=".45"/><stop offset="1" stop-color="#1c7285" stop-opacity=".05"/></radialGradient></defs><rect x="70" y="28" width="480" height="218" rx="7" fill="#102c3a" stroke="#6e9bad" stroke-width="${Math.round(2 + (p.insulation / 100) * 8)}"/><rect x="86" y="44" width="448" height="184" fill="url(#hot)"/><path d="M105 205 Q170 ${145 - lift} 250 ${222 - lift} T410 ${190 - lift} T515 ${120 - lift / 2}" fill="none" stroke="#ffbd75" stroke-width="2" stroke-dasharray="7 5"/><g fill="#a6e5e2" font-size="10"><text x="82" y="18">OUTER WALL</text><text x="275" y="265">AIRFLOW VECTOR FIELD →</text></g><g stroke="#a5dfe0" stroke-width="2" fill="none"><path d="${arrows}"/></g></svg>`
}
