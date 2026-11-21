// Types for lib/domain.js, which stays exactly as the earlier ACRYL-app starter had it (pure code, no framework).
export class OrderDeskError extends Error {}
export const STAGES: string[]
export interface Address { name: string; email: string }
export interface Product { sku: string; name: string; unit: string; priceCents: number; onHand: number; reserved: number; onOrder: number; reorderAt: number; reorderQty: number; supplier: Address | null }
export interface Email { id: number; from: Address; subject: string; body: string; received: string; status: string; orderId: number | null }
export interface OrderLine { sku: string; name: string; qty: number; priceCents: number }
export interface Order { id: number; number: string; customer: Address; emailId: number | null; lines: OrderLine[]; note: string; created: string; stage: string; history: { at: string; stage: string; note: string }[] }
export interface Message { id: number; at: string; kind: string; to: Address; subject: string; body: string; orderId: number | null; emailId?: number }
export interface Workflow { company: string; sender: string; approvalAboveCents: number }
export interface OrderDeskState { nextId: number; nextOrder: number; workflow: Workflow; products: Product[]; emails: Email[]; orders: Order[]; outbox: Message[] }
type Input = Record<string, unknown>
export function emptyState(): OrderDeskState
export function toCents(value: unknown): number
export function formatMoney(cents: number): string
export function parseAddress(value: unknown): Address
export function available(product: Product): number
export function stockStatus(product: Product): string
export function addProduct(state: OrderDeskState, input: Input): OrderDeskState
export function backlog(state: OrderDeskState, sku: string): number
export function reorderSuggestions(state: OrderDeskState): { sku: string; name: string; available: number; owed: number; reorderAt: number; qty: number }[]
export function receiveEmail(state: OrderDeskState, input: Input, now: string): OrderDeskState
export function inbox(state: OrderDeskState): Email[]
export function replyToEmail(state: OrderDeskState, input: Input, now: string): OrderDeskState
export function messageCustomer(state: OrderDeskState, input: Input, now: string): OrderDeskState
export function ignoreEmail(state: OrderDeskState, id: number): OrderDeskState
export function parseLines(value: unknown): { sku: string; qty: number }[]
export function orderTotal(order: Order): number
export function createOrder(state: OrderDeskState, input: Input, now: string): OrderDeskState
export function approveOrder(state: OrderDeskState, id: number, now: string): OrderDeskState
export function deliveryNoteNumber(order: Order): string
export function shipOrder(state: OrderDeskState, id: number, now: string): OrderDeskState
export function cancelOrder(state: OrderDeskState, id: number, reason: unknown, now: string): OrderDeskState
export function receiveStock(state: OrderDeskState, input: Input, now: string): OrderDeskState
export function reorder(state: OrderDeskState, input: Input, now: string): OrderDeskState
export function setWorkflow(state: OrderDeskState, input: Input): OrderDeskState
export function pipeline(state: OrderDeskState): { inbox: Email[]; approval: Order[]; ready: Order[]; backorder: Order[]; shipped: Order[] }
export function stats(state: OrderDeskState): { newEmails: number; openOrders: number; toApprove: number; toShip: number; backorders: number; openValueCents: number; lowStock: number }
export function loadSample(state: OrderDeskState, now: string): OrderDeskState
