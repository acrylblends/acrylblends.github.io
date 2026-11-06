/**
 * The board a new install starts with: three services across development, staging and production, eighteen deployments today (one failed, one still
 * building), two open incidents and the event timeline the mockup shows.
 */
import type { Deployment, Environment, Incident, ReleaseEvent, ReleaseState, Service } from './domain.ts'
import { stampOf } from './domain.ts'

const SERVICES: readonly { name: string; repository: string; owner: string }[] = [
  { name: 'api-gateway', repository: 'webboxes/api-gateway', owner: 'Alex M.' },
  { name: 'web-frontend', repository: 'webboxes/web-frontend', owner: 'J. Lee' },
  { name: 'worker-jobs', repository: 'webboxes/worker-jobs', owner: 'CI bot' },
]

const ENVIRONMENTS: readonly { name: string; region: string; kind: 'dev' | 'stg' | 'prod' }[] = [
  { name: 'Development', region: 'eu-central-1', kind: 'dev' },
  { name: 'Staging', region: 'eu-central-1', kind: 'stg' },
  { name: 'Production', region: 'eu-central-1', kind: 'prod' },
]

interface Latest {
  readonly service: string
  readonly env: 'dev' | 'stg' | 'prod'
  readonly version: string
  readonly commit: string
  readonly status: Deployment['status']
  readonly minutesAgo: number
  readonly seconds: number
  readonly actor: string
}

const LATEST: readonly Latest[] = [
  { service: 'api-gateway', env: 'dev', version: 'v2.18.0', commit: '8a31fc2', status: 'succeeded', minutesAgo: 4, seconds: 240, actor: 'Alex M.' },
  { service: 'web-frontend', env: 'dev', version: 'v4.2.1', commit: 'c2de903', status: 'building', minutesAgo: 2, seconds: 0, actor: 'CI bot' },
  { service: 'worker-jobs', env: 'dev', version: 'v1.12.3', commit: '91fd1a7', status: 'succeeded', minutesAgo: 28, seconds: 314, actor: 'CI bot' },
  { service: 'api-gateway', env: 'stg', version: 'v2.18.0-rc.2', commit: '6b4d221', status: 'succeeded', minutesAgo: 18, seconds: 380, actor: 'CI bot' },
  { service: 'web-frontend', env: 'stg', version: 'v4.2.1-rc.1', commit: 'c2de903', status: 'failed', minutesAgo: 11, seconds: 180, actor: 'CI bot' },
  { service: 'worker-jobs', env: 'stg', version: 'v1.12.3', commit: '91fd1a7', status: 'succeeded', minutesAgo: 35, seconds: 300, actor: 'CI bot' },
  { service: 'api-gateway', env: 'prod', version: 'v2.17.4', commit: '3f5bc12', status: 'succeeded', minutesAgo: 180, seconds: 520, actor: 'Alex M.' },
  { service: 'web-frontend', env: 'prod', version: 'v4.1.8', commit: 'b1c2d34', status: 'succeeded', minutesAgo: 240, seconds: 480, actor: 'J. Lee' },
  { service: 'worker-jobs', env: 'prod', version: 'v1.12.2', commit: 'a04cf18', status: 'succeeded', minutesAgo: 300, seconds: 460, actor: 'CI bot' },
]

const OLDER: readonly Latest[] = [
  { service: 'api-gateway', env: 'dev', version: 'v2.17.9', commit: 'aa102cc', status: 'succeeded', minutesAgo: 360, seconds: 250, actor: 'CI bot' },
  { service: 'web-frontend', env: 'dev', version: 'v4.2.0', commit: 'bb201dd', status: 'succeeded', minutesAgo: 350, seconds: 290, actor: 'CI bot' },
  { service: 'worker-jobs', env: 'dev', version: 'v1.12.2', commit: 'cc302ee', status: 'succeeded', minutesAgo: 340, seconds: 310, actor: 'CI bot' },
  { service: 'api-gateway', env: 'stg', version: 'v2.18.0-rc.1', commit: 'dd403ff', status: 'succeeded', minutesAgo: 330, seconds: 360, actor: 'CI bot' },
  { service: 'web-frontend', env: 'stg', version: 'v4.2.0', commit: 'ee50400', status: 'succeeded', minutesAgo: 320, seconds: 340, actor: 'CI bot' },
  { service: 'worker-jobs', env: 'stg', version: 'v1.12.2', commit: 'ff60511', status: 'succeeded', minutesAgo: 310, seconds: 330, actor: 'CI bot' },
  { service: 'api-gateway', env: 'prod', version: 'v2.17.3', commit: 'a170622', status: 'succeeded', minutesAgo: 300, seconds: 540, actor: 'Alex M.' },
  { service: 'web-frontend', env: 'prod', version: 'v4.1.7', commit: 'b280733', status: 'succeeded', minutesAgo: 290, seconds: 500, actor: 'J. Lee' },
  { service: 'worker-jobs', env: 'prod', version: 'v1.12.1', commit: 'c390844', status: 'succeeded', minutesAgo: 280, seconds: 470, actor: 'CI bot' },
]

export function seed(now: Date, newId: (kind: string) => string): ReleaseState {
  const at = (minutesAgo: number): string => stampOf(new Date(now.getTime() - minutesAgo * 60_000))
  const services: Service[] = SERVICES.map((service) => ({ id: newId('service'), ...service }))
  const environments: Environment[] = ENVIRONMENTS.map((environment) => ({ id: newId('environment'), ...environment }))
  const serviceOf = (name: string): Service => services.find((service) => service.name === name) as Service
  const envOf = (kind: string): Environment => environments.find((environment) => environment.kind === kind) as Environment
  const deployments: Deployment[] = []
  const add = (item: Latest, logs: string): void => {
    deployments.push({
      id: newId('deployment'),
      serviceId: serviceOf(item.service).id,
      environmentId: envOf(item.env).id,
      version: item.version,
      commit: item.commit,
      status: item.status,
      actor: item.actor,
      startedAt: at(item.minutesAgo),
      durationSeconds: item.seconds,
      logs,
    })
  }
  for (const item of LATEST) {
    const logs = item.status === 'failed'
      ? 'health check failed: HTTP 502 on /health after 180s'
      : item.status === 'building'
        ? 'build started; waiting for the image'
        : 'deployment completed; health check passed'
    add(item, logs)
  }
  for (const item of OLDER) add(item, 'deployment completed; health check passed')
  const incidents: Incident[] = [
    {
      id: newId('incident'),
      number: 'INC-024',
      serviceId: serviceOf('web-frontend').id,
      environmentId: envOf('stg').id,
      severity: 'high',
      status: 'open',
      summary: 'Staging frontend health check',
      assignee: 'Alex M.',
      openedAt: at(11),
      timeline: [
        { at: at(11), text: 'Opened by the health check after HTTP 502.' },
        { at: at(10), text: 'Assigned to Alex M.' },
      ],
    },
    {
      id: newId('incident'),
      number: 'INC-021',
      serviceId: serviceOf('worker-jobs').id,
      environmentId: envOf('prod').id,
      severity: 'medium',
      status: 'open',
      summary: 'Worker queue latency elevated',
      assignee: 'J. Lee',
      openedAt: at(150),
      timeline: [
        { at: at(150), text: 'Opened: p95 processing time above 4s for 8 minutes.' },
        { at: at(120), text: 'J. Lee acknowledged and started investigating.' },
      ],
    },
    {
      id: newId('incident'),
      number: 'INC-018',
      serviceId: serviceOf('api-gateway').id,
      environmentId: envOf('dev').id,
      severity: 'low',
      status: 'resolved',
      summary: 'Development gateway restarted',
      assignee: 'CI bot',
      openedAt: at(60 * 26),
      timeline: [
        { at: at(60 * 26), text: 'Opened after a restart.' },
        { at: at(60 * 25), text: 'Resolved: the restart was a planned deploy.' },
      ],
    },
  ]
  const events: ReleaseEvent[] = [
    { id: newId('event'), type: 'deploy', entityId: deployments[0]?.id ?? '', message: 'api-gateway v2.18.0 deployed to DEV', at: at(4) },
    { id: newId('event'), type: 'incident', entityId: incidents[0]?.id ?? '', message: 'Staging health check failed for web-frontend', at: at(11) },
    { id: newId('event'), type: 'promote', entityId: deployments[3]?.id ?? '', message: 'Release v2.18.0-rc.2 promoted to STG', at: at(18) },
    { id: newId('event'), type: 'deploy', entityId: deployments[2]?.id ?? '', message: 'worker-jobs v1.12.3 deployed to DEV', at: at(28) },
  ]
  return { version: 1, services, environments, deployments, incidents, events }
}
