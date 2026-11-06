/**
 * The workspace a new install starts with: AWS and Google Cloud connected, a November that costs €18,462.80, October's service totals for the
 * month-over-month change, five budgets (one per biggest service and the whole bill), two alerts and two allocation rules.
 */
import type { Alert, BillingImport, Budget, CostLine, FinopsState, Provider, ProviderSource } from './domain.ts'
import { stampOf } from './domain.ts'

interface ServiceSeed {
  readonly service: string
  readonly provider: ProviderSource
  readonly account: string
  readonly region: string
  readonly amount: number
  readonly previous: number
}

const SERVICES: readonly ServiceSeed[] = [
  { service: 'Compute / EC2', provider: 'aws', account: 'prod-aws', region: 'eu-central-1', amount: 6420.20, previous: 5620.00 },
  { service: 'Managed database', provider: 'aws', account: 'prod-aws', region: 'eu-central-1', amount: 4180.00, previous: 3940.00 },
  { service: 'Object storage', provider: 'gcp', account: 'media-gcp', region: 'europe-west3', amount: 2840.60, previous: 2910.00 },
  { service: 'Network egress', provider: 'aws', account: 'prod-aws', region: 'eu-central-1', amount: 1920.00, previous: 1576.00 },
  { service: 'Compute / GCE', provider: 'gcp', account: 'media-gcp', region: 'europe-west3', amount: 1240.20, previous: 1180.00 },
  { service: 'Logging', provider: 'gcp', account: 'media-gcp', region: 'europe-west3', amount: 860.00, previous: 820.00 },
  { service: 'Container registry', provider: 'gcp', account: 'media-gcp', region: 'europe-west3', amount: 520.40, previous: 540.00 },
  { service: 'Support', provider: 'aws', account: 'prod-aws', region: 'eu-central-1', amount: 481.40, previous: 460.00 },
]

const WEIGHTS = [0.16, 0.17, 0.18, 0.18, 0.16, 0.15] as const

export function seed(now: Date, newId: (kind: string) => string): FinopsState {
  const providers: Provider[] = [
    { id: newId('provider'), name: 'Amazon Web Services', sourceType: 'aws', connected: true },
    { id: newId('provider'), name: 'Google Cloud', sourceType: 'gcp', connected: true },
    { id: newId('provider'), name: 'Azure', sourceType: 'azure', connected: false },
  ]
  const providerOf = (source: ProviderSource): Provider => providers.find((provider) => provider.sourceType === source) as Provider
  const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']
  const costs: CostLine[] = []
  for (const service of SERVICES) {
    const amounts = WEIGHTS.map((weight) => Math.round(service.amount * weight * 100) / 100)
    const difference = Math.round((service.amount - amounts.reduce((sum, value) => sum + value, 0)) * 100) / 100
    amounts[amounts.length - 1] = Math.round(((amounts[amounts.length - 1] ?? 0) + difference) * 100) / 100
    for (const [index, amount] of amounts.entries()) {
      costs.push({
        id: newId('cost'),
        providerId: providerOf(service.provider).id,
        service: service.service,
        account: service.account,
        region: service.region,
        day: days[index] as string,
        amount,
        currency: 'EUR',
      })
    }
    costs.push({
      id: newId('cost'),
      providerId: providerOf(service.provider).id,
      service: service.service,
      account: service.account,
      region: service.region,
      day: '2026-10-31',
      amount: service.previous,
      currency: 'EUR',
    })
  }
  const imports: BillingImport[] = [
    { id: newId('import'), providerId: providerOf('aws').id, period: '2026-11', fileName: 'aws-november-2026.csv', status: 'imported', lines: 24, importedAt: stampOf(new Date(now.getTime() - 3.4 * 3_600_000)) },
    { id: newId('import'), providerId: providerOf('gcp').id, period: '2026-11', fileName: 'gcp-november-2026.csv', status: 'imported', lines: 24, importedAt: stampOf(new Date(now.getTime() - 3.6 * 3_600_000)) },
  ]
  const budgets: Budget[] = [
    { id: newId('budget'), name: 'Cloud infrastructure', scope: 'all', limit: 25_000, period: 'monthly', alertThreshold: 80 },
    { id: newId('budget'), name: 'Compute', scope: 'compute', limit: 7_500, period: 'monthly', alertThreshold: 80 },
    { id: newId('budget'), name: 'Managed database', scope: 'database', limit: 5_800, period: 'monthly', alertThreshold: 80 },
    { id: newId('budget'), name: 'Object storage', scope: 'storage', limit: 4_800, period: 'monthly', alertThreshold: 80 },
    { id: newId('budget'), name: 'Network egress', scope: 'egress', limit: 2_000, period: 'monthly', alertThreshold: 80 },
  ]
  const alerts: Alert[] = [
    { id: newId('alert'), budgetId: budgets[4]?.id ?? '', forecast: 9_600, triggeredAt: stampOf(new Date(now.getTime() - 5 * 3_600_000)), status: 'open', note: 'Network egress is forecast to exceed its €2,000 limit.' },
    { id: newId('alert'), budgetId: budgets[1]?.id ?? '', forecast: 32_100, triggeredAt: stampOf(new Date(now.getTime() - 26 * 3_600_000)), status: 'open', note: 'Compute is above its alert threshold.' },
  ]
  return {
    version: 1,
    providers,
    imports,
    costs,
    budgets,
    alerts,
    rules: [
      { id: newId('rule'), service: 'compute', team: 'Platform' },
      { id: newId('rule'), service: 'storage', team: 'Media' },
    ],
  }
}
