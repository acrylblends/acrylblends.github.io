// Types for lib/domain.js, which stays exactly as the earlier ACRYL-app starter had it (pure code, no framework).
export class GtdError extends Error {}
export const STATUSES: string[]
export interface Item { id: number; title: string; note: string | undefined; status: string; project: string | undefined; due: string | undefined; tags: string[]; createdAt: string; doneAt: string | undefined }
export interface GtdState { items: Item[]; nextId: number }
export function emptyState(): GtdState
export function capture(state: GtdState, input: { title?: unknown; note?: unknown; due?: unknown; tags?: unknown }): GtdState
export function triage(state: GtdState, input: { id: number; status?: unknown; project?: unknown; due?: unknown; tags?: unknown }): GtdState
export function complete(state: GtdState, id: number): GtdState
export function byStatus(state: GtdState, status: unknown): Item[]
export function projects(state: GtdState): { project: string; open: number; done: number }[]
export function itemsForProject(state: GtdState, project: unknown): Item[]
export function agenda(state: GtdState, day: unknown): Item[]
export function upcoming(state: GtdState, from: unknown, days?: number): { day: string; items: Item[] }[]
