/**
 * The notebook service: notebooks, experiments, append-only measurements, observations and attachments, the audit trail and unit conversion. It owns
 * the state and calls the store; the clock and the id maker are injected, so a test can pin both.
 */
import {
  cleanExperimentTitle,
  cleanFilename,
  cleanFormulation,
  cleanMethod,
  cleanMimeType,
  cleanNotebookCode,
  cleanNotebookTitle,
  cleanObjective,
  cleanObservationBody,
  cleanParameter,
  cleanProtocol,
  cleanSampleId,
  cleanSize,
  cleanUnit,
  cleanValue,
  convert as convertValue,
  kindOf,
  LabError,
  nextExperimentNumber,
  stampOf,
  type Attachment,
  type AuditEvent,
  type Experiment,
  type LabState,
  type Measurement,
  type Notebook,
  type Observation,
  type Unit,
} from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'

export interface LabAdapters {
  readonly store: Store<LabState>
  readonly clock: () => Date
  readonly newId: (kind: string) => string
}

export interface NewNotebookInput {
  readonly code: string
  readonly title: string
  readonly project: string
}

export interface NewExperimentInput {
  readonly notebookId: string
  readonly title: string
  readonly objective: string
  readonly method: string
  readonly protocolVersion: string
}

export interface NewMeasurementInput {
  readonly sampleId: string
  readonly formulation: string
  readonly parameter: string
  readonly value: unknown
  readonly unit: string
}

export interface NewAttachmentInput {
  readonly filename: string
  readonly mimeType: string
  readonly sizeBytes: unknown
}

export class Lab {
  private state: LabState
  private readonly adapters: LabAdapters

  private constructor(state: LabState, adapters: LabAdapters) {
    this.state = state
    this.adapters = adapters
  }

  static async open(adapters: LabAdapters): Promise<Lab> {
    const saved = await adapters.store.load()
    return new Lab(saved ?? seed(adapters.clock(), adapters.newId), adapters)
  }

  get now(): Date {
    return this.adapters.clock()
  }

  notebooks(): readonly Notebook[] {
    return this.state.notebooks
  }

  notebook(id: string): Notebook | undefined {
    return this.state.notebooks.find((notebook) => notebook.id === id)
  }

  experiments(notebookId?: string): Experiment[] {
    return this.state.experiments
      .filter((experiment) => notebookId === undefined || experiment.notebookId === notebookId)
      .sort((a, b) => a.number - b.number)
  }

  experiment(id: string): Experiment | undefined {
    return this.state.experiments.find((experiment) => experiment.id === id)
  }

  /** The record the first page opens: the first experiment of the first notebook. */
  activeExperiment(): Experiment {
    return this.experiments(this.state.notebooks[0]?.id)[0] as Experiment
  }

  instrument(id: string): { name: string; location: string } | undefined {
    return this.state.instruments.find((instrument) => instrument.id === id)
  }

  measurements(experimentId: string, filter: { formulation?: string; kind?: 'sample' | 'average' } = {}): Measurement[] {
    return this.state.measurements
      .filter((measurement) => measurement.experimentId === experimentId)
      .filter((measurement) => filter.formulation === undefined || measurement.formulation === filter.formulation)
      .filter((measurement) => filter.kind === undefined || measurement.kind === filter.kind)
      .sort((a, b) => a.sampleId.localeCompare(b.sampleId))
  }

  averages(experimentId: string): Measurement[] {
    return this.measurements(experimentId, { kind: 'average' }).sort((a, b) => a.formulation.localeCompare(b.formulation))
  }

  observations(experimentId: string): Observation[] {
    return this.state.observations
      .filter((observation) => observation.experimentId === experimentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  attachments(experimentId: string): Attachment[] {
    return this.state.attachments
      .filter((attachment) => attachment.experimentId === experimentId)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }

  audit(experimentId: string): AuditEvent[] {
    return this.state.audit
      .filter((event) => event.experimentId === experimentId)
      .sort((a, b) => b.at.localeCompare(a.at))
  }

  convert(value: number, from: Unit, to: Unit): number {
    return convertValue(value, from, to)
  }

  async addObservation(experimentId: string, body: unknown, author = 'You'): Promise<Observation> {
    this.requireExperiment(experimentId)
    const observation: Observation = {
      id: this.adapters.newId('observation'),
      experimentId,
      authorId: author === 'You' ? 'you' : 'maya-chen',
      author,
      body: cleanObservationBody(body),
      createdAt: stampOf(this.adapters.clock()),
    }
    return this.commit(() => {
      this.state.observations.push(observation)
      this.state.audit.push(this.event(experimentId, 'Observation appended'))
      return observation
    })
  }

  async addMeasurement(experimentId: string, input: NewMeasurementInput): Promise<Measurement> {
    this.requireExperiment(experimentId)
    const measurement: Measurement = {
      id: this.adapters.newId('measurement'),
      experimentId,
      kind: 'sample',
      sampleId: cleanSampleId(input.sampleId),
      formulation: cleanFormulation(input.formulation),
      parameter: cleanParameter(input.parameter),
      value: cleanValue(input.value),
      unit: cleanUnit(input.unit),
      measuredAt: stampOf(this.adapters.clock()),
    }
    return this.commit(() => {
      this.state.measurements.push(measurement)
      this.state.audit.push(this.event(experimentId, `Measurement appended for ${measurement.sampleId}`))
      return measurement
    })
  }

  async addAttachment(experimentId: string, input: NewAttachmentInput): Promise<Attachment> {
    this.requireExperiment(experimentId)
    const mimeType = cleanMimeType(input.mimeType)
    const attachment: Attachment = {
      id: this.adapters.newId('attachment'),
      experimentId,
      filename: cleanFilename(input.filename),
      mimeType,
      sizeBytes: cleanSize(input.sizeBytes),
      kind: kindOf(mimeType),
      addedAt: stampOf(this.adapters.clock()),
    }
    return this.commit(() => {
      this.state.attachments.push(attachment)
      this.state.audit.push(this.event(experimentId, `Attachment added: ${attachment.filename}`))
      return attachment
    })
  }

  async addNotebook(input: NewNotebookInput): Promise<Notebook> {
    const notebook: Notebook = {
      id: this.adapters.newId('notebook'),
      code: cleanNotebookCode(input.code),
      title: cleanNotebookTitle(input.title),
      project: input.project.trim().slice(0, 80) || 'Unassigned',
      ownerId: 'you',
    }
    if (this.state.notebooks.some((entry) => entry.code === notebook.code))
      throw new LabError('invalid', `Notebook ${notebook.code} already exists.`)
    return this.commit(() => {
      this.state.notebooks.push(notebook)
      return notebook
    })
  }

  async addExperiment(input: NewExperimentInput): Promise<Experiment> {
    const notebook = this.notebook(input.notebookId)
    if (notebook === undefined) throw new LabError('invalid', 'Choose a notebook that exists.')
    const number = nextExperimentNumber(this.state.experiments.filter((experiment) => experiment.notebookId === notebook.id))
    const instrument = this.state.instruments[0]
    const experiment: Experiment = {
      id: this.adapters.newId('experiment'),
      notebookId: notebook.id,
      code: `${notebook.code.replace(/^[A-Z]-/, 'EXP-')}-${String(number).padStart(2, '0')}`,
      number,
      title: cleanExperimentTitle(input.title),
      question: `Study ${String(number)}: ${cleanExperimentTitle(input.title)}`,
      objective: cleanObjective(input.objective),
      method: cleanMethod(input.method),
      protocolVersion: cleanProtocol(input.protocolVersion),
      startedAt: stampOf(this.adapters.clock()),
      status: 'planned',
      instrumentId: instrument?.id ?? '',
      location: instrument?.location ?? 'Unassigned',
      sampleSeries: `${notebook.code} series ${String(number).padStart(2, '0')}`,
    }
    return this.commit(() => {
      this.state.experiments.push(experiment)
      this.state.audit.push(this.event(experiment.id, 'Experiment created'))
      return experiment
    })
  }

  exportRecord(experimentId: string): {
    notebook: Notebook
    experiment: Experiment
    measurements: Measurement[]
    observations: Observation[]
    attachments: Attachment[]
    audit: AuditEvent[]
  } {
    const experiment = this.requireExperiment(experimentId)
    return {
      notebook: this.notebook(experiment.notebookId) as Notebook,
      experiment,
      measurements: this.measurements(experimentId),
      observations: this.observations(experimentId),
      attachments: this.attachments(experimentId),
      audit: this.audit(experimentId),
    }
  }

  /** The sample-level measurements as CSV (averages stay in the record, not the data table). */
  csv(experimentId: string): string {
    const escape = (value: string): string => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
    const rows = ['sample_id,formulation,parameter,value,unit,measured_at']
    for (const measurement of this.measurements(experimentId, { kind: 'sample' })) {
      rows.push(
        [measurement.sampleId, measurement.formulation, measurement.parameter, String(measurement.value), measurement.unit, measurement.measuredAt]
          .map(escape)
          .join(','),
      )
    }
    return `${rows.join('\n')}\n`
  }

  async save(): Promise<void> {
    this.state = {
      ...this.state,
      notebooks: [...this.state.notebooks],
      experiments: [...this.state.experiments],
      measurements: [...this.state.measurements],
      observations: [...this.state.observations],
      attachments: [...this.state.attachments],
      audit: [...this.state.audit],
    }
    try {
      await this.adapters.store.save(this.state)
    } catch (error) {
      throw new LabError('storage', `The notebook could not be saved: ${(error as Error).message}`)
    }
  }

  private requireExperiment(id: string): Experiment {
    const experiment = this.experiment(id)
    if (experiment === undefined) throw new LabError('not-found', 'That experiment no longer exists.')
    return experiment
  }

  /** Run a mutation and persist it; a failed save restores the previous state, so memory never claims a write that failed. */
  private async commit<T>(change: () => T): Promise<T> {
    const snapshot = structuredClone(this.state)
    const result = change()
    try {
      await this.save()
    } catch (error) {
      this.state = snapshot
      throw error
    }
    return result
  }

  private event(experimentId: string, action: string): AuditEvent {
    return {
      id: this.adapters.newId('audit'),
      experimentId,
      actor: 'You',
      action,
      at: stampOf(this.adapters.clock()),
    }
  }
}
