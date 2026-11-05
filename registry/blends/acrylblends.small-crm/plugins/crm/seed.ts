/**
 * What a first launch shows: the Northstar Studio team (two people), seven companies, seven contacts (one without a company), seven deals across the
 * board's four stages (one of them unassigned), a follow-up due today and one overdue. Dates are around Thursday 5 November 2026.
 */
import type { CrmState } from './domain.ts'

export function seed(): CrmState {
  return {
    version: 1,
    owners: [
      { id: 'owner-am', name: 'Alex Morgan', initials: 'AM', title: 'Sales owner' },
      { id: 'owner-jl', name: 'Jamie Lee', initials: 'JL', title: 'Account executive' },
    ],
    companies: [
      { id: 'company-acme', name: 'Acme Robotics', website: 'acme-robotics.example', industry: 'Robotics', tint: 'purple' },
      { id: 'company-nordic', name: 'Nordic Freight', website: 'nordicfreight.example', industry: 'Logistics', tint: 'orange' },
      { id: 'company-fieldnote', name: 'Fieldnote GmbH', website: 'fieldnote.example', industry: 'Software', tint: 'teal' },
      { id: 'company-velocity', name: 'VeloCity Group', website: 'velocity-group.example', industry: 'Mobility', tint: 'blue' },
      { id: 'company-karo', name: 'Studio Karo', website: 'studiokaro.example', industry: 'Fitness', tint: 'red' },
      { id: 'company-meridian', name: 'Meridian Foods', website: 'meridianfoods.example', industry: 'Food and drink', tint: 'gold' },
      { id: 'company-lakehouse', name: 'Lakehouse Labs', website: 'lakehouselabs.example', industry: 'Data and analytics', tint: 'green' },
    ],
    contacts: [
      { id: 'contact-elena', companyId: 'company-velocity', name: 'Elena Fischer', email: 'elena.fischer@velocity-group.example', role: 'Head of Digital' },
      { id: 'contact-marc', companyId: 'company-acme', name: 'Marc Dubois', email: 'marc@acme-robotics.example', role: 'Operations Director' },
      { id: 'contact-ingrid', companyId: 'company-nordic', name: 'Ingrid Solberg', email: 'ingrid.solberg@nordicfreight.example', role: 'Fleet Manager' },
      { id: 'contact-sofia', companyId: 'company-karo', name: 'Sofia Karo', email: 'sofia@studiokaro.example', role: 'Founder' },
      { id: 'contact-tom', companyId: 'company-meridian', name: 'Tom Okafor', email: 'tom.okafor@meridianfoods.example', role: 'Supply Chain Lead' },
      { id: 'contact-hannah', companyId: 'company-lakehouse', name: 'Hannah Lee', email: 'hannah@lakehouselabs.example', role: 'CTO' },
      { id: 'contact-priya', name: 'Priya Nair', email: 'priya.nair@freelance.example', role: 'Independent consultant' },
    ],
    deals: [
      { id: 'deal-acme', companyId: 'company-acme', contactId: 'contact-marc', title: 'Operations platform', value: 28000, currency: 'EUR', stage: 'qualified', probability: 65, ownerId: 'owner-am', closeDate: '2026-11-12' },
      { id: 'deal-nordic', companyId: 'company-nordic', contactId: 'contact-ingrid', title: 'Fleet visibility dashboard', value: 16500, currency: 'EUR', stage: 'qualified', probability: 40, ownerId: 'owner-jl', closeDate: '2026-11-18' },
      { id: 'deal-fieldnote', companyId: 'company-fieldnote', title: 'Internal knowledge base', value: 12000, currency: 'EUR', stage: 'qualified', probability: 35, closeDate: '2026-11-24' },
      { id: 'deal-velocity', companyId: 'company-velocity', contactId: 'contact-elena', title: 'Customer portal redesign', value: 42000, currency: 'EUR', stage: 'proposal', probability: 75, ownerId: 'owner-am', closeDate: '2026-11-14' },
      { id: 'deal-karo', companyId: 'company-karo', contactId: 'contact-sofia', title: 'Booking and member app', value: 31000, currency: 'EUR', stage: 'proposal', probability: 60, ownerId: 'owner-jl', closeDate: '2026-11-10' },
      { id: 'deal-meridian', companyId: 'company-meridian', contactId: 'contact-tom', title: 'Order management', value: 51000, currency: 'EUR', stage: 'negotiation', probability: 85, ownerId: 'owner-am', closeDate: '2026-11-06' },
      { id: 'deal-lakehouse', companyId: 'company-lakehouse', contactId: 'contact-hannah', title: 'Analytics workspace', value: 22500, currency: 'EUR', stage: 'won', probability: 100, ownerId: 'owner-am', closeDate: '2026-10-29' },
    ],
    activities: [
      { id: 'activity-1', dealId: 'deal-velocity', type: 'proposal', body: 'Proposal sent', at: '2026-11-04T14:32', ownerId: 'owner-am' },
      { id: 'activity-2', dealId: 'deal-velocity', type: 'meeting', body: 'Scope confirmed with Elena', at: '2026-10-30T10:00', ownerId: 'owner-am' },
      { id: 'activity-3', dealId: 'deal-velocity', type: 'call', body: 'Discovery call, 42 min', at: '2026-10-24T15:00', ownerId: 'owner-am' },
      { id: 'activity-4', dealId: 'deal-meridian', type: 'email', body: 'Sent the revised order-flow estimate', at: '2026-11-03T11:20', ownerId: 'owner-am' },
      { id: 'activity-5', dealId: 'deal-meridian', type: 'meeting', body: 'Pricing review with Tom', at: '2026-10-28T13:00', ownerId: 'owner-am' },
      { id: 'activity-6', dealId: 'deal-karo', type: 'proposal', body: 'Proposal sent for the booking app', at: '2026-11-02T16:05', ownerId: 'owner-jl' },
      { id: 'activity-7', dealId: 'deal-acme', type: 'call', body: 'Qualification call with Marc', at: '2026-11-03T09:30', ownerId: 'owner-am' },
      { id: 'activity-8', dealId: 'deal-nordic', type: 'email', body: 'Asked Ingrid for a sample of fleet data', at: '2026-10-30T12:10', ownerId: 'owner-jl' },
      { id: 'activity-9', dealId: 'deal-lakehouse', type: 'stage', body: 'Marked won', at: '2026-10-29T17:45', ownerId: 'owner-am' },
      { id: 'activity-10', dealId: 'deal-fieldnote', type: 'note', body: 'Inbound request through the website, nobody owns it yet', at: '2026-11-04T08:15' },
    ],
    tasks: [
      { id: 'task-1', dealId: 'deal-velocity', title: 'Follow up on proposal', channel: 'Email', dueAt: '2026-11-05T11:00', status: 'open' },
      { id: 'task-2', dealId: 'deal-meridian', title: 'Send the contract for signature', channel: 'Email', dueAt: '2026-11-06T10:00', status: 'open' },
      { id: 'task-3', dealId: 'deal-nordic', title: 'Chase the sample fleet data', channel: 'Call', dueAt: '2026-11-03T14:00', status: 'open' },
      { id: 'task-4', dealId: 'deal-karo', title: 'Walk Sofia through the proposal', channel: 'Meeting', dueAt: '2026-11-10T09:30', status: 'open' },
      { id: 'task-5', dealId: 'deal-acme', title: 'Share the platform overview', channel: 'Email', dueAt: '2026-11-12T09:00', status: 'open' },
    ],
  }
}
