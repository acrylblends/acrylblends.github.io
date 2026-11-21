// Types for lib/domain.js, which stays exactly as the earlier ACRYL-app starter had it (pure code, no framework).
export interface Todo { id: number; title: string; due: string | undefined; done: boolean }
export interface Meeting { id: number; title: string; start: string; end: string; with?: string }
export interface OrganizerState { nextId: number; todos: Todo[]; meetings: Meeting[] }
export class OrganizerError extends Error {}
export function emptyState(): OrganizerState
export function addTodo(state: OrganizerState, input: { title?: unknown; due?: unknown }): OrganizerState
export function completeTodo(state: OrganizerState, id: number): OrganizerState
export function openTodos(state: OrganizerState): Todo[]
export function conflictWith(state: OrganizerState, startMs: number, endMs: number): Meeting | undefined
export function bookMeeting(state: OrganizerState, input: { title?: unknown; start?: unknown; minutes?: unknown; with?: unknown }): OrganizerState
export function cancelMeeting(state: OrganizerState, id: number): OrganizerState
export function agenda(state: OrganizerState, day: unknown): { day: string; meetings: Meeting[]; todos: Todo[] }
export function freeSlots(state: OrganizerState, day: unknown, minutes?: number, from?: string, to?: string): { start: string; end: string }[]
