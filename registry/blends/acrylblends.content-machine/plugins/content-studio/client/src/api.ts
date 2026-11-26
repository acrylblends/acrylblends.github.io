/** The screen's calls to the content machine's HTTP API (plugins/content-api), and the live events. */
import type { Brand, Job, Project } from '../../../content/model.ts'

export type { Brand, Job, Project }

export interface ActionInfo { readonly name: string; readonly title: string; readonly description: string; readonly input: unknown }
export interface FeatureInfo { readonly id: string; readonly title: string; readonly order: number; readonly summary: string; readonly actions: readonly ActionInfo[] }
export interface ServiceInfo { readonly configured: boolean; readonly baseUrl: string; readonly model: string; readonly keySet: boolean; readonly from: 'settings' | 'environment' | 'none'; readonly env: string }
export interface Status { readonly tools: Record<string, boolean>; readonly writer: ServiceInfo; readonly transcriber: ServiceInfo }
export interface LibraryFile { readonly file: string; readonly kind: 'audio' | 'image' | 'video' | 'other'; readonly bytes: number }

const base = (document.getElementById('content-studio')?.dataset.base ?? '').replace(/\/$/, '')
export const API = `${base}/content/api`

export class ApiError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
  if (!response.ok) throw new ApiError(data.error ?? `${response.status}`, data.code ?? 'error')
  return data as T
}

export const api = {
  features: () => call<{ features: FeatureInfo[] }>('/features').then((r) => r.features),
  status: () => call<Status>('/status'),
  saveService: (service: 'writer' | 'transcriber', body: { baseUrl: string; model: string; apiKey: string }) => call<ServiceInfo>(`/settings/${service}`, body),
  brand: () => call<{ brand: Brand }>('/brand').then((r) => r.brand),
  setBrand: (brand: Partial<Brand>) => call<{ brand: Brand }>('/brand', brand).then((r) => r.brand),
  library: () => call<{ files: LibraryFile[] }>('/library').then((r) => r.files),
  projects: () => call<{ projects: Project[] }>('/projects').then((r) => r.projects),
  project: (id: string) => call<{ project: Project; jobs: Job[] }>(`/projects/${id}`),
  create: (name: string) => call<{ project: Project }>('/projects', { name }).then((r) => r.project),
  remove: (id: string) => call(`/projects/${id}/delete`, {}),
  settings: (id: string, change: Record<string, unknown>) => call<{ project: Project }>(`/projects/${id}/settings`, change).then((r) => r.project),
  keep: (id: string, removal: string, kept: boolean) => call<{ project: Project }>(`/projects/${id}/removals/${removal}`, { kept }).then((r) => r.project),
  run: (id: string, feature: string, action: string, input: Record<string, unknown> = {}) => call<{ job: Job }>(`/projects/${id}/run/${feature}/${action}`, { input }).then((r) => r.job),
  stop: (job: string) => call(`/jobs/${job}/stop`, {}),
  file: (id: string, file: string, version?: string) => `${API}/projects/${id}/files/${file.split('/').map(encodeURIComponent).join('/')}${version ? `?v=${encodeURIComponent(version)}` : ''}`,
  download: (id: string, file: string) => `${API}/projects/${id}/files/${file.split('/').map(encodeURIComponent).join('/')}?download=1`,
  libraryFile: (file: string) => `${API}/library/${encodeURIComponent(file)}`,
}

/** Uploads a file with progress; `path` is `/projects/<id>/upload` or `/library`. */
export function upload(path: string, file: File, onProgress: (fraction: number) => void): Promise<{ file: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}${path}?name=${encodeURIComponent(file.name)}`)
    xhr.setRequestHeader('x-content-machine', 'upload')
    xhr.setRequestHeader('content-type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    xhr.onload = () => {
      let data: { file?: string; error?: string } = {}
      try { data = JSON.parse(xhr.responseText) as typeof data } catch { /* empty */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.file) resolve({ file: data.file })
      else reject(new Error(data.error ?? `upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('the upload was interrupted'))
    xhr.send(file)
  })
}

export type Event =
  | { type: 'project'; project: Project }
  | { type: 'deleted'; id: string }
  | { type: 'job'; job: Job }
  | { type: 'brand'; brand: Brand }
  | { type: 'features' }

export function events(onEvent: (event: Event) => void): () => void {
  const source = new EventSource(`${API}/events`)
  for (const type of ['project', 'deleted', 'job', 'brand', 'features'])
    source.addEventListener(type, (e) => { try { onEvent(JSON.parse((e as MessageEvent).data as string) as Event) } catch { /* ignore */ } })
  return () => source.close()
}

export const clock = (seconds: number | undefined): string => {
  if (seconds === undefined || !Number.isFinite(seconds)) return '-'
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const bytes = (n: number): string => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
