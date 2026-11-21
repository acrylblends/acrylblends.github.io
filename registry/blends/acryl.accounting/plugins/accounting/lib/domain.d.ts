// Types for lib/domain.js, which stays exactly as the earlier ACRYL-app starter had it (pure code, no framework).
export class AccountingError extends Error {}
export const VAT_RATES: number[]
export const CURRENCY: string
export interface Line { description: string; quantity: number; unitCents: number }
export interface Invoice { id: number; number: string; client: string; issued: string; due: string; lines: Line[]; vatRate: number; status: 'open' | 'paid'; paidOn: string | null }
export interface Expense { id: number; date: string; description: string; category: string; grossCents: number; vatRate: number }
export interface AccountingState { invoices: Invoice[]; expenses: Expense[]; nextInvoice: number; nextExpense: number }
export interface Range { from: string; to: string; label?: string }
export function emptyState(): AccountingState
export function toCents(amount: unknown, what?: string): number
export function formatMoney(cents: number): string
export function invoiceTotals(invoice: Invoice): { net: number; vat: number; gross: number }
export function expenseTotals(expense: Expense): { net: number; vat: number; gross: number }
export function addInvoice(state: AccountingState, input: Record<string, unknown>, today: string): AccountingState
export function markPaid(state: AccountingState, id: number, paidOn: unknown): AccountingState
export function addExpense(state: AccountingState, input: Record<string, unknown>, today: string): AccountingState
export function listInvoices(state: AccountingState, filter?: { status?: unknown }): Invoice[]
export function listExpenses(state: AccountingState, filter?: { from?: string; to?: string }): Expense[]
export function periodRange(input: { period?: unknown; from?: unknown; to?: unknown }): Range
export function summary(state: AccountingState, range: Range): Record<string, unknown>
export interface Totals { net: number; vat: number; gross: number }
export interface AccountingView { currency: string; today: string; vatRates: number[]; invoices: (Invoice & Totals & { overdue: boolean })[]; expenses: (Expense & Totals)[] }
export function view(state: AccountingState, today: string): AccountingView
