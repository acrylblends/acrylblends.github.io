/**
 * The studio a person sees on the first start: five demo connectors (HubSpot CRM, a CSV upload, Stripe, PostgreSQL, Snowflake), three pipelines (Customer
 * sync is the one in the mockup), and the latest run of Customer sync: 248 fetched, 244 synced, 4 skipped.
 */
import { type Connector, type Field, type Pipeline, type StudioState, type SyncRun, simulate } from './domain.ts'

const f = (name: string, type: Field['type'], required = false): Field => ({ name, type, ...(required ? { required } : {}) })

const CONNECTORS: Connector[] = [
  { id: 'hubspot', name: 'HubSpot CRM', letter: 'H', role: 'source', object: 'contacts', records: 248, connected: true, credentialRef: 'vault://demo/hubspot', fields: [f('first_name', 'string'), f('last_name', 'string'), f('email', 'email'), f('company', 'string'), f('phone_number', 'phone'), f('country', 'string')] },
  { id: 'csv', name: 'CSV upload', letter: 'C', role: 'source', object: 'leads.csv', records: 60, connected: true, credentialRef: 'none', fields: [f('full_name', 'string'), f('mail', 'email'), f('organisation', 'string'), f('tel', 'phone')] },
  { id: 'stripe', name: 'Stripe', letter: 'S', role: 'source', object: 'customers', records: 120, connected: false, credentialRef: 'vault://demo/stripe', fields: [f('customer_id', 'string'), f('name', 'string'), f('email', 'email'), f('currency', 'string')] },
  { id: 'postgres', name: 'PostgreSQL', letter: 'P', role: 'destination', object: 'customers', records: 0, connected: true, credentialRef: 'vault://demo/postgres', fields: [f('given_name', 'string', true), f('family_name', 'string', true), f('email_address', 'email', true), f('organization', 'string'), f('phone', 'phone'), f('country_code', 'string')] },
  { id: 'snowflake', name: 'Snowflake', letter: 'F', role: 'destination', object: 'CUSTOMERS', records: 0, connected: false, credentialRef: 'vault://demo/snowflake', fields: [f('customer_id', 'string', true), f('name', 'string', true), f('email', 'email', true), f('currency', 'string')] },
]

export function seed(now: Date): StudioState {
  const minutes = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
  const customerSync: Pipeline = {
    id: 'customer-sync',
    name: 'Customer sync',
    sourceId: 'hubspot',
    destinationId: 'postgres',
    mappings: [
      { source: 'first_name', transform: 'trim', destination: 'given_name' },
      { source: 'last_name', transform: 'trim', destination: 'family_name' },
      { source: 'email', transform: 'lowercase', destination: 'email_address' },
      { source: 'company', transform: 'none', destination: 'organization' },
    ],
    version: 4,
    dirty: false,
    editedBy: 'Alex',
    editedAt: minutes(8),
  }
  const leadIntake: Pipeline = { id: 'lead-intake', name: 'Lead intake', sourceId: 'csv', destinationId: 'postgres', mappings: [], version: 1, dirty: false, editedBy: 'Alex', editedAt: minutes(60 * 26) }
  const invoiceExport: Pipeline = { id: 'invoice-export', name: 'Stripe customers', sourceId: 'stripe', destinationId: 'snowflake', mappings: [], version: 2, dirty: false, editedBy: 'Sam', editedAt: minutes(60 * 72) }
  const source = CONNECTORS[0]
  const destination = CONNECTORS[3]
  if (source === undefined || destination === undefined) throw new Error('seed')
  const sim = simulate(customerSync, source, destination)
  const at = (offset: number) => new Date(now.getTime() - 3 * 60_000 + offset * 1000).toISOString()
  const run: SyncRun = {
    id: 'run-1',
    pipelineId: 'customer-sync',
    at: at(0),
    fetched: sim.fetched,
    synced: sim.synced,
    skipped: sim.skipped,
    failed: sim.failed,
    durationSec: 3.2,
    issues: sim.issues,
    lines: [
      { at: at(0), level: 'ok', text: 'Source connected' },
      { at: at(1), level: 'ok', text: `${String(sim.fetched)} records fetched` },
      { at: at(2), level: 'warn', text: `${String(sim.skipped)} records need review` },
      { at: at(3), level: 'ok', text: `${String(sim.synced)} records synced` },
    ],
  }
  return { version: 1, workspace: 'Northstar', planLimit: 10, connectors: CONNECTORS, pipelines: [customerSync, leadIntake, invoiceExport], runs: [run] }
}
