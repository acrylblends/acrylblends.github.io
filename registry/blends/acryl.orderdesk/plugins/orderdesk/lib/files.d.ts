// Types for lib/files.js, which stays exactly as the earlier ACRYL-app starter had it.
import type { Message, Order, OrderDeskState, Workflow } from './domain.js'
export function parseEmailFile(raw: string): Record<string, unknown>
export function renderEml(message: Message, sender: string, company: string): string
export function renderDeliveryNote(order: Order, workflow: Workflow): string
export function writeFiles(home: string, state: OrderDeskState): void
export function pendingEmailFiles(home: string): { file: string; raw: string }[]
export function moveAway(file: string, folder: string): void
export function ensureInbox(home: string): void
