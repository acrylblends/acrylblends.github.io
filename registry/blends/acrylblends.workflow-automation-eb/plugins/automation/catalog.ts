/**
 * The integrations this app can run: Qadam Flow's integration packages ("qadams", MIT, published on npm as `@aiqadam/qadam-*`), loaded as they are.
 * Each is one package with actions and triggers and typed properties; the catalog lists them for the editor and the agent, and hands the executor the
 * action or trigger a step names. Adding an integration is `npm install @aiqadam/qadam-<name>` and one line in INTEGRATIONS; the editor and the
 * engine need no change (the spec, 2.6).
 */
import { createRequire } from 'node:module'
import type { Action, QadamProperty, Trigger } from '@aiqadam/qadams-framework'
import * as dataMapper from '@aiqadam/qadam-data-mapper'
import * as dateHelper from '@aiqadam/qadam-date-helper'
import * as delay from '@aiqadam/qadam-delay'
import * as http from '@aiqadam/qadam-http'
import * as json from '@aiqadam/qadam-json'
import * as manualTrigger from '@aiqadam/qadam-manual-trigger'
import * as mathHelper from '@aiqadam/qadam-math-helper'
import * as schedule from '@aiqadam/qadam-schedule'
import * as webhook from '@aiqadam/qadam-webhook'

/** The packages, by name: the name a step records (`settings.qadamName`), as Qadam's flows do. */
const INTEGRATIONS: ReadonlyArray<readonly [string, unknown]> = [
  ['@aiqadam/qadam-manual-trigger', manualTrigger],
  ['@aiqadam/qadam-schedule', schedule],
  ['@aiqadam/qadam-webhook', webhook],
  ['@aiqadam/qadam-http', http],
  ['@aiqadam/qadam-data-mapper', dataMapper],
  ['@aiqadam/qadam-json', json],
  ['@aiqadam/qadam-math-helper', mathHelper],
  ['@aiqadam/qadam-date-helper', dateHelper],
  ['@aiqadam/qadam-delay', delay],
]

/** What the Qadam framework's `Qadam` class gives (`createQadam`). */
interface QadamModule {
  readonly displayName: string
  readonly description?: string
  readonly auth?: unknown
  getAction(name: string): Action | undefined
  getTrigger(name: string): Trigger | undefined
  actions(): Record<string, Action>
  triggers(): Record<string, Trigger>
}

/** A property as the editor and the agent read it: no functions, only what a form and a model need. */
export interface PropertyView {
  readonly name: string
  readonly type: string
  readonly displayName: string
  readonly description?: string
  readonly required: boolean
  readonly defaultValue?: unknown
  /** A static dropdown's choices. */
  readonly options?: ReadonlyArray<{ readonly label: string, readonly value: unknown }>
  /** True when the choices or the sub-fields depend on other fields (a dropdown with options(), dynamic properties): ask `refreshProperty`. */
  readonly dynamic?: boolean
  readonly refreshers?: readonly string[]
}

export interface OperationView {
  readonly integration: string
  readonly name: string
  readonly displayName: string
  readonly description: string
  readonly kind: 'action' | 'trigger'
  /** A trigger's way of starting a run: MANUAL, POLLING (a schedule here), WEBHOOK, APP_WEBHOOK. */
  readonly strategy?: string
  readonly properties: readonly PropertyView[]
  readonly requiresConnection: boolean
}

export interface IntegrationView {
  readonly name: string
  readonly version: string
  readonly displayName: string
  readonly description: string
  readonly actions: readonly OperationView[]
  readonly triggers: readonly OperationView[]
}

const require = createRequire(import.meta.url)
const versionOf = (name: string): string => (require(`${name}/package.json`) as { version: string }).version

function qadamOf(module: unknown): QadamModule {
  const candidates = [module, (module as { default?: unknown }).default].flatMap((value) => (value !== null && typeof value === 'object' ? Object.values(value) : []))
  const found = candidates.find((value): value is QadamModule => value !== null && typeof value === 'object' && typeof (value as QadamModule).getAction === 'function')
  if (found === undefined) throw new Error('an integration package exports no Qadam')
  return found
}

export function propertyView(name: string, property: QadamProperty): PropertyView {
  const raw = property as QadamProperty & { options?: unknown, refreshers?: readonly string[], props?: unknown, defaultValue?: unknown, description?: string }
  const staticOptions = typeof raw.options === 'object' && raw.options !== null && Array.isArray((raw.options as { options?: unknown }).options)
    ? ((raw.options as { options: Array<{ label: string, value: unknown }> }).options).map(({ label, value }) => ({ label, value }))
    : undefined
  const dynamic = typeof raw.options === 'function' || typeof raw.props === 'function'
  return {
    name,
    type: raw.type,
    displayName: raw.displayName,
    ...(raw.description === undefined ? {} : { description: raw.description }),
    required: raw.required === true,
    ...(raw.defaultValue === undefined ? {} : { defaultValue: raw.defaultValue }),
    ...(staticOptions === undefined ? {} : { options: staticOptions }),
    ...(dynamic ? { dynamic: true, refreshers: raw.refreshers ?? [] } : {}),
  }
}

function operationView(integration: string, kind: 'action' | 'trigger', operation: Action | Trigger, auth: unknown): OperationView {
  const props = (operation as { props: Record<string, QadamProperty> }).props
  return {
    integration,
    name: operation.name,
    displayName: operation.displayName,
    description: operation.description,
    kind,
    ...(kind === 'trigger' ? { strategy: String((operation as Trigger).type) } : {}),
    properties: Object.entries(props).filter(([, p]) => p.type !== 'MARKDOWN').map(([name, p]) => propertyView(name, p)),
    requiresConnection: auth !== undefined && (operation as { requireAuth?: boolean }).requireAuth !== false,
  }
}

export class Catalog {
  readonly #qadams = new Map<string, { readonly qadam: QadamModule, readonly version: string }>()

  constructor(modules: ReadonlyArray<readonly [string, unknown]> = INTEGRATIONS) {
    for (const [name, module] of modules) this.#qadams.set(name, { qadam: qadamOf(module), version: versionOf(name) })
  }

  integrations(): IntegrationView[] {
    return [...this.#qadams].map(([name, { qadam, version }]) => ({
      name,
      version,
      displayName: qadam.displayName,
      description: qadam.description ?? '',
      actions: Object.values(qadam.actions()).map((a) => operationView(name, 'action', a, qadam.auth)),
      triggers: Object.values(qadam.triggers()).map((t) => operationView(name, 'trigger', t, qadam.auth)),
    }))
  }

  /** Actions and triggers whose name, description or integration match every word of `query`. */
  search(query: string, kind?: 'action' | 'trigger'): OperationView[] {
    const words = query.toLowerCase().split(/\s+/u).filter(Boolean)
    return this.integrations().flatMap((i) => [...i.actions, ...i.triggers].map((op) => ({ op, text: `${i.displayName} ${op.displayName} ${op.name} ${op.description}`.toLowerCase() })))
      .filter(({ op, text }) => (kind === undefined || op.kind === kind) && words.every((w) => text.includes(w)))
      .map(({ op }) => op)
  }

  version(integration: string): string | undefined {
    return this.#qadams.get(integration)?.version
  }

  integration(integration: string): QadamModule | undefined {
    return this.#qadams.get(integration)?.qadam
  }

  action(integration: string, name: string): Action | undefined {
    return this.#qadams.get(integration)?.qadam.getAction(name)
  }

  trigger(integration: string, name: string): Trigger | undefined {
    return this.#qadams.get(integration)?.qadam.getTrigger(name)
  }

  /**
   * A field whose choices or sub-fields depend on others (a dropdown with options(), dynamic properties such as the HTTP body for its body type): ask
   * the integration with the step's current input. @returns the sub-fields, or the choices.
   */
  async refresh(integration: string, kind: 'action' | 'trigger', operation: string, property: string, input: Record<string, unknown>): Promise<{ readonly properties?: PropertyView[], readonly options?: ReadonlyArray<{ readonly label: string, readonly value: unknown }>, readonly placeholder?: string }> {
    const definition = kind === 'action' ? this.action(integration, operation) : this.trigger(integration, operation)
    const prop = (definition as { props?: Record<string, QadamProperty> } | undefined)?.props?.[property] as (QadamProperty & { props?: (input: unknown, ctx: unknown) => Promise<Record<string, QadamProperty>>, options?: unknown }) | undefined
    if (prop === undefined) throw new Error(`${integration} ${operation} has no field ${property}`)
    const ctx = { server: { apiUrl: '', publicUrl: '', token: '' }, project: { id: 'local', externalId: async () => undefined }, flows: { current: { id: '', version: { id: '' } }, list: async () => ({ data: [] }) }, connections: { get: async () => undefined } }
    if (typeof prop.props === 'function') {
      const props: Record<string, QadamProperty> = (await prop.props(input, ctx)) ?? {}
      return { properties: Object.entries(props).filter(([, p]) => p.type !== 'MARKDOWN').map(([name, p]) => propertyView(name, p)) }
    }
    if (typeof prop.options === 'function') {
      const result = await (prop.options as (input: unknown, ctx: unknown) => Promise<{ options?: Array<{ label: string, value: unknown }>, placeholder?: string }>)(input, ctx)
      return { options: (result.options ?? []).map(({ label, value }) => ({ label, value })), ...(result.placeholder === undefined ? {} : { placeholder: result.placeholder }) }
    }
    return {}
  }

  operation(integration: string, kind: 'action' | 'trigger', name: string): OperationView | undefined {
    const view = this.integrations().find((i) => i.name === integration)
    return (kind === 'action' ? view?.actions : view?.triggers)?.find((op) => op.name === name)
  }
}
