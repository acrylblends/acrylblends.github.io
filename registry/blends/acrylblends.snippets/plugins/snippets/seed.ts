/**
 * The library a new install starts with: 128 snippets across the five languages, three collections and twelve starred favourites. The snippets
 * are ordinary code a developer would keep: small, self-contained and worth pasting. Timestamps are relative to the first start, so the list reads
 * "2h ago" on the day it is opened.
 */
import type { Collection, Language, Snippet, SnippetsState } from './domain.ts'
import { variablesOf } from './domain.ts'

interface Definition {
  readonly title: string
  readonly description: string
  readonly language: Language
  readonly tags: readonly string[]
  readonly code: string
}

const def = (
  title: string,
  description: string,
  language: Language,
  tags: readonly string[],
  code: string,
): Definition => ({ title, description, language, tags, code })

const TYPESCRIPT: readonly Definition[] = [
  def('retry-with-backoff', 'Exponential retry wrapper for async calls', 'TypeScript', ['async', 'resilience', 'network'], `export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    attempts = 4,
    baseDelay = 250,
    maxDelay = 5000,
  } = options;

  for (let attempt = 0;; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = Math.min(
        baseDelay * 2 ** attempt, maxDelay
      );
      await sleep(delay);
    }
  }
}`),
  def('use-debounced-value', 'React hook with cleanup', 'TypeScript', ['react', 'hooks', 'ui'], `export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}`),
  def('safe-fetch', 'Timeout + typed response', 'TypeScript', ['http', 'fetch', 'types'], `export async function safeFetch<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 8000, ...rest } = init;
  const response = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(\`HTTP \${response.status} from \${url}\`);
  return (await response.json()) as T;
}`),
  def('typed-event-emitter', 'A tiny typed emitter', 'TypeScript', ['events', 'types', 'pattern'], `type Handler<T> = (value: T) => void;

export class Emitter<E extends Record<string, unknown>> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as Handler<never>);
    this.handlers.set(event, set);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(event: K, value: E[K]): void {
    this.handlers.get(event)?.forEach((handler) => handler(value as never));
  }
}`),
  def('group-by', 'Group an array into a record', 'TypeScript', ['array', 'collection'], `export function groupBy<T, K extends PropertyKey>(items: readonly T[], key: (item: T) => K): Record<K, T[]> {
  return items.reduce((groups, item) => {
    const group = key(item);
    (groups[group] ??= []).push(item);
    return groups;
  }, {} as Record<K, T[]>);
}`),
  def('unique-by', 'Dedupe an array by a key', 'TypeScript', ['array', 'collection'], `export function uniqueBy<T>(items: readonly T[], key: (item: T) => unknown): T[] {
  const seen = new Set<unknown>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}`),
  def('sleep', 'A promise that resolves after a delay', 'TypeScript', ['async', 'timing'], `export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));`),
  def('exhaustive-check', 'A compile-time check for a closed union', 'TypeScript', ['types', 'safety'], `export function assertNever(value: never): never {
  throw new Error(\`Unexpected value: \${JSON.stringify(value)}\`);
}`),
  def('deep-clone', 'Clone plain data without JSON', 'TypeScript', ['object', 'data'], `export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepClone) as T;
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = deepClone(item);
    return copy as T;
  }
  return value;
}`),
  def('throttle', 'Run at most once per window', 'TypeScript', ['async', 'timing'], `export function throttle<A extends unknown[]>(fn: (...args: A) => void, waitMs: number) {
  let last = 0;
  return (...args: A): void => {
    const now = Date.now();
    if (now - last < waitMs) return;
    last = now;
    fn(...args);
  };
}`),
  def('debounce', 'Wait for quiet before running', 'TypeScript', ['async', 'timing'], `export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}`),
  def('parse-query', 'Read a query string into a typed object', 'TypeScript', ['http', 'parsing'], `export function parseQuery(url: string): Record<string, string> {
  const query = url.split('?')[1] ?? '';
  return Object.fromEntries(new URLSearchParams(query));
}`),
  def('format-bytes', 'Bytes as KiB, MiB or GiB', 'TypeScript', ['format', 'numbers'], `export function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return \`\${value.toFixed(unit === 0 ? 0 : 1)} \${units[unit]}\`;
}`),
  def('clamp', 'Keep a number inside a range', 'TypeScript', ['numbers'], `export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);`),
  def('range', 'An array of numbers', 'TypeScript', ['array'], `export const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);`),
  def('chunk', 'Split an array into fixed-size groups', 'TypeScript', ['array'], `export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('size must be positive');
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}`),
  def('pick', 'Choose a subset of an object', 'TypeScript', ['object', 'types'], `export function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  return keys.reduce((result, key) => {
    result[key] = value[key];
    return result;
  }, {} as Pick<T, K>);
}`),
  def('omit', 'Drop keys from an object', 'TypeScript', ['object', 'types'], `export function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}`),
  def('is-record', 'A runtime check for a plain object', 'TypeScript', ['types', 'validation'], `export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}`),
  def('parse-bool', 'Read a boolean from an environment value', 'TypeScript', ['config', 'parsing'], `export function parseBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}`),
  def('once', 'Run a function at most once', 'TypeScript', ['function'], `export function once<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let done = false;
  let result: R;
  return (...args: A): R => {
    if (!done) {
      result = fn(...args);
      done = true;
    }
    return result;
  };
}`),
  def('memoize', 'Cache a function by its arguments', 'TypeScript', ['function', 'cache'], `export function memoize<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const cache = new Map<string, R>();
  return (...args: A): R => {
    const key = JSON.stringify(args);
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key) as R;
  };
}`),
  def('wait-for', 'Poll until a condition holds', 'TypeScript', ['async', 'testing'], `export async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}`),
  def('assert-defined', 'Narrow away undefined', 'TypeScript', ['types', 'safety'], `export function assertDefined<T>(value: T | undefined, message = 'expected a value'): T {
  if (value === undefined) throw new Error(message);
  return value;
}`),
  def('sort-by', 'Stable multi-key sort', 'TypeScript', ['array', 'sorting'], `export function sortBy<T>(items: readonly T[], ...keys: ((item: T) => string | number)[]): T[] {
  return [...items].sort((a, b) => {
    for (const key of keys) {
      const left = key(a);
      const right = key(b);
      if (left < right) return -1;
      if (left > right) return 1;
    }
    return 0;
  });
}`),
  def('title-case', 'Capitalise every word', 'TypeScript', ['string', 'format'], `export const titleCase = (text: string): string =>
  text.toLowerCase().replace(/\\b\\w/g, (letter) => letter.toUpperCase());`),
  def('slugify', 'A URL-safe slug', 'TypeScript', ['string', 'url'], `export const slugify = (text: string): string =>
  text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');`),
  def('truncate', 'Cut text at a word boundary', 'TypeScript', ['string', 'format'], `export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return \`\${cut.slice(0, cut.lastIndexOf(' ')) || cut}…\`;
}`),
  def('iso-day', 'Today as YYYY-MM-DD', 'TypeScript', ['date', 'format'], `export const isoDay = (date = new Date()): string =>
  date.toISOString().slice(0, 10);`),
  def('add-days', 'A date moved by whole days', 'TypeScript', ['date'], `export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}`),
  def('human-duration', 'Milliseconds as a short duration', 'TypeScript', ['date', 'format'], `export function humanDuration(ms: number): string {
  if (ms < 1000) return \`\${Math.round(ms)} ms\`;
  if (ms < 60_000) return \`\${(ms / 1000).toFixed(1)} s\`;
  return \`\${Math.floor(ms / 60_000)}m \${Math.round((ms % 60_000) / 1000)}s\`;
}`),
  def('escape-html', 'Escape text for HTML', 'TypeScript', ['string', 'html', 'security'], `export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');`),
  def('template', 'Replace {{placeholders}} in text', 'TypeScript', ['string'], `export function template(text: string, values: Record<string, string>): string {
  return text.replace(/\\{\\{\\s*([^{}]+?)\\s*\\}\\}/g, (whole, name: string) => values[name] ?? whole);
}`),
  def('csv-line', 'One CSV row, quoted where needed', 'TypeScript', ['csv', 'format'], `export function csvLine(values: readonly unknown[]): string {
  return values
    .map((value) => {
      const text = String(value ?? '');
      return /[",\\n]/.test(text) ? \`"\${text.replaceAll('"', '""')}"\` : text;
    })
    .join(',');
}`),
  def('parse-json', 'Parse JSON without throwing', 'TypeScript', ['json', 'parsing'], `export function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}`),
  def('result', 'A small Result type', 'TypeScript', ['pattern', 'types'], `export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });`),
  def('invariant', 'Fail fast on a broken assumption', 'TypeScript', ['safety'], `export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}`),
  def('random-id', 'A short, URL-safe id', 'TypeScript', ['id', 'random'], `export function randomId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, length);
}`),
  def('ensure-array', 'One value or an array to an array', 'TypeScript', ['array'], `export const ensureArray = <T>(value: T | readonly T[] | undefined | null): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? [...value] : [value as T];`),
  def('map-limit', 'Run async tasks with a concurrency limit', 'TypeScript', ['async', 'performance'], `export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}`),
  def('percent', 'A ratio as a percentage', 'TypeScript', ['numbers', 'format'], `export const percent = (part: number, whole: number, digits = 1): string =>
  whole === 0 ? '0%' : \`\${((part / whole) * 100).toFixed(digits)}%\`;`),
  def('capitalize', 'Upper-case the first letter', 'TypeScript', ['string'], `export const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);`),
  def('sum', 'The sum of numbers', 'TypeScript', ['numbers', 'array'], `export const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);`),
  def('mean', 'The average of numbers', 'TypeScript', ['numbers', 'statistics'], `export const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;`),
  def('zip', 'Pair two arrays into tuples', 'TypeScript', ['array'], `export function zip<A, B>(left: readonly A[], right: readonly B[]): [A, B][] {
  return left.slice(0, Math.min(left.length, right.length)).map((item, index) => [item, right[index] as B]);
}`),
]

const JAVASCRIPT: readonly Definition[] = [
  def('parse-env-file', 'Small .env parser', 'JavaScript', ['config', 'parsing'], `export function parseEnv(text) {
  const env = {};
  for (const line of text.split('\\n')) {
    const match = /^\\s*([A-Z0-9_]+)\\s*=\\s*(.*)\\s*$/.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    env[match[1]] = value;
  }
  return env;
}`),
  def('copy-text', 'Copy text to the clipboard', 'JavaScript', ['browser', 'clipboard'], `export async function copyText(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}`),
  def('download-blob', 'Download text as a file', 'JavaScript', ['browser', 'file'], `export function downloadText(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}`),
  def('storage-json', 'Typed local storage', 'JavaScript', ['browser', 'storage'], `export const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};`),
  def('format-date', 'A local date a person reads', 'JavaScript', ['date', 'format'], `export const formatDate = (date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));`),
  def('relative-time', 'Time ago from a timestamp', 'JavaScript', ['date', 'format'], `export function relativeTime(then) {
  const seconds = Math.floor((Date.now() - new Date(then).getTime()) / 1000);
  const units = [[60, 's'], [60, 'm'], [24, 'h'], [7, 'd'], [4.35, 'w'], [12, 'mo'], [Infinity, 'y']];
  let value = seconds;
  for (const [size, label] of units) {
    if (value < size) return \`\${Math.floor(value)}\${label} ago\`;
    value /= size;
  }
}`),
  def('querystring', 'Build a query string', 'JavaScript', ['url'], `export function queryString(values) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text === '' ? '' : \`?\${text}\`;
}`),
  def('escape-regex', 'Escape text for a regular expression', 'JavaScript', ['regex', 'string'], `export const escapeRegex = (text) =>
  text.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');`),
  def('intersect', 'The common values of two arrays', 'JavaScript', ['array'], `export const intersect = (left, right) => {
  const set = new Set(right);
  return [...new Set(left)].filter((value) => set.has(value));
};`),
  def('difference', 'Values in one array but not another', 'JavaScript', ['array'], `export const difference = (left, right) => {
  const set = new Set(right);
  return [...new Set(left)].filter((value) => !set.has(value));
};`),
  def('shuffle', 'Shuffle an array without mutating it', 'JavaScript', ['array', 'random'], `export function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}`),
  def('sample', 'A random item', 'JavaScript', ['array', 'random'], `export const sample = (items) => items[Math.floor(Math.random() * items.length)];`),
  def('format-number', 'Thousands separators', 'JavaScript', ['format', 'numbers'], `export const formatNumber = (value, digits = 0) =>
  new Intl.NumberFormat('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);`),
  def('format-currency', 'Money in EUR', 'JavaScript', ['format', 'money'], `export const formatEuro = (value) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(value);`),
  def('get-cookie', 'Read a cookie by name', 'JavaScript', ['browser', 'cookie'], `export function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}`),
  def('set-cookie', 'Write a cookie', 'JavaScript', ['browser', 'cookie'], `export function setCookie(name, value, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = \`\${name}=\${encodeURIComponent(value)}; expires=\${expires}; path=/; SameSite=Lax\`;
}`),
  def('on-ready', 'Run after the document is ready', 'JavaScript', ['browser', 'dom'], `export function onReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}`),
  def('delegate', 'Delegate an event to matching children', 'JavaScript', ['browser', 'dom'], `export function delegate(root, selector, event, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler.call(target, e, target);
  });
}`),
  def('scroll-to-top', 'Smooth scroll to the top', 'JavaScript', ['browser', 'dom'], `export const scrollToTop = () =>
  window.scrollTo({ top: 0, behavior: 'smooth' });`),
  def('is-in-view', 'Whether an element is visible', 'JavaScript', ['browser', 'dom'], `export function isInView(element) {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}`),
  def('uid', 'A short unique id', 'JavaScript', ['id'], `export const uid = () => Math.random().toString(36).slice(2, 10);`),
  def('deep-get', 'Read a nested value by path', 'JavaScript', ['object', 'path'], `export function deepGet(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}`),
  def('deep-set', 'Write a nested value by path', 'JavaScript', ['object', 'path'], `export function deepSet(value, path, next) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((current, key) => (current[key] ??= {}), value);
  target[last] = next;
  return value;
}`),
  def('flat-object', 'Flatten nested keys', 'JavaScript', ['object'], `export function flatten(value, prefix = '') {
  return Object.entries(value).reduce((flat, [key, item]) => {
    const path = prefix === '' ? key : \`\${prefix}.\${key}\`;
    return item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.assign(flat, flatten(item, path))
      : Object.assign(flat, { [path]: item });
  }, {});
}`),
  def('wait', 'Wait for a number of milliseconds', 'JavaScript', ['async', 'timing'], `export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));`),
  def('all-settled-values', 'Values of successful promises', 'JavaScript', ['async'], `export async function settledValues(promises) {
  const results = await Promise.allSettled(promises);
  return results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
}`),
  def('fetch-json', 'Fetch and parse JSON', 'JavaScript', ['http', 'fetch'], `export async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
  return response.json();
}`),
  def('post-json', 'POST a JSON body', 'JavaScript', ['http', 'fetch'], `export const postJson = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((response) => response.json());`),
  def('chunk-array', 'Split an array into groups', 'JavaScript', ['array'], `export function chunkArray(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}`),
  def('group-list', 'Group objects by a key', 'JavaScript', ['array'], `export const groupList = (items, key) =>
  items.reduce((groups, item) => {
    const value = key(item);
    (groups[value] ??= []).push(item);
    return groups;
  }, {});`),
  def('pick-values', 'Pick keys from an object', 'JavaScript', ['object'], `export const pickValues = (value, keys) =>
  Object.fromEntries(keys.map((key) => [key, value[key]]));`),
  def('unique', 'The unique values of an array', 'JavaScript', ['array'], `export const unique = (items) => [...new Set(items)];`),
  def('truncate-text', 'Truncate text with an ellipsis', 'JavaScript', ['string'], `export const truncateText = (text, max) =>
  text.length <= max ? text : \`\${text.slice(0, max).trimEnd()}…\`;`),
  def('escape-html-js', 'Escape text for HTML', 'JavaScript', ['string', 'html', 'security'], `export const escapeHtml = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');`),
]

const PYTHON: readonly Definition[] = [
  def('csv-to-dict', 'CSV rows to objects', 'Python', ['csv', 'parsing'], `import csv

def csv_to_dict(path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))`),
  def('read-json', 'Read a JSON file', 'Python', ['json', 'file'], `import json

def read_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)`),
  def('write-json', 'Write a JSON file atomically', 'Python', ['json', 'file'], `import json
import os

def write_json(path, data):
    temporary = f"{path}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
    os.replace(temporary, path)`),
  def('chunk-list', 'Split a list into chunks', 'Python', ['list'], `def chunk(items, size):
    for start in range(0, len(items), size):
        yield items[start:start + size]`),
  def('flatten', 'Flatten nested lists', 'Python', ['list'], `def flatten(items):
    for item in items:
        if isinstance(item, (list, tuple)):
            yield from flatten(item)
        else:
            yield item`),
  def('group-by', 'Group dictionaries by a key', 'Python', ['list', 'dict'], `from collections import defaultdict

def group_by(items, key):
    groups = defaultdict(list)
    for item in items:
        groups[item[key]].append(item)
    return dict(groups)`),
  def('retry', 'Retry a function with backoff', 'Python', ['async', 'resilience'], `import time

def retry(operation, attempts=4, base_delay=0.25):
    for attempt in range(attempts + 1):
        try:
            return operation()
        except Exception:
            if attempt == attempts:
                raise
            time.sleep(min(base_delay * 2 ** attempt, 5))`),
  def('parse-date', 'Parse an ISO date', 'Python', ['date'], `from datetime import date

def parse_date(text):
    return date.fromisoformat(text)`),
  def('days-between', 'Days between two dates', 'Python', ['date'], `from datetime import date

def days_between(earlier, later):
    return (later - earlier).days`),
  def('human-size', 'Bytes as a readable size', 'Python', ['format'], `def human_size(size):
    for unit in ("B", "KiB", "MiB", "GiB"):
        if size < 1024 or unit == "GiB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{size} B"
        size /= 1024`),
  def('slugify', 'A URL-safe slug', 'Python', ['string', 'url'], `import re
import unicodedata

def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")`),
  def('unique-preserve', 'Unique values in order', 'Python', ['list'], `def unique_preserve(items):
    seen = set()
    return [item for item in items if not (item in seen or seen.add(item))]`),
  def('env', 'Read an environment variable', 'Python', ['config'], `import os

def env(name, default=None):
    value = os.environ.get(name)
    return default if value is None or value == "" else value`),
  def('atomic-write', 'Write a text file atomically', 'Python', ['file'], `import os

def atomic_write(path, text):
    temporary = f"{path}.tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        handle.write(text)
    os.replace(temporary, path)`),
  def('mean', 'The average of numbers', 'Python', ['statistics'], `def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else 0`),
  def('median', 'The median of numbers', 'Python', ['statistics'], `def median(values):
    values = sorted(values)
    middle = len(values) // 2
    if not values:
        return 0
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / 2`),
  def('timer', 'Time a block of code', 'Python', ['timing'], `from contextlib import contextmanager
from time import perf_counter

@contextmanager
def timer(label=""):
    start = perf_counter()
    yield
    print(f"{label}: {perf_counter() - start:.3f}s")`),
  def('tail', 'The last lines of a file', 'Python', ['file'], `from collections import deque

def tail(path, lines=20):
    with open(path, encoding="utf-8") as handle:
        return list(deque(handle, maxlen=lines))`),
  def('walk-files', 'Every file under a folder', 'Python', ['file'], `from pathlib import Path

def walk_files(root, pattern="*"):
    yield from Path(root).rglob(pattern)`),
  def('load-env', 'Load a .env file', 'Python', ['config', 'parsing'], `def load_env(path):
    values = {}
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values`),
  def('jsonl', 'Read JSON lines', 'Python', ['json', 'file'], `import json

def read_jsonl(path):
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)`),
  def('percent', 'A ratio as a percentage', 'Python', ['format', 'numbers'], `def percent(part, whole, digits=1):
    return "0%" if whole == 0 else f"{(part / whole) * 100:.{digits}f}%"`),
]

const SQL: readonly Definition[] = [
  def('postgres-json-merge', 'Merge JSONB fields atomically', 'SQL', ['postgres', 'json'], `UPDATE documents
SET metadata = metadata || '{"reviewed": true}'::jsonb
WHERE id = $1
RETURNING *;`),
  def('upsert', 'Insert or update a row', 'SQL', ['postgres', 'upsert'], `INSERT INTO accounts (id, name, plan)
VALUES ($1, $2, $3)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, plan = EXCLUDED.plan
RETURNING *;`),
  def('top-n-per-group', 'The newest row per group', 'SQL', ['window', 'postgres'], `SELECT DISTINCT ON (customer_id) *
FROM orders
ORDER BY customer_id, placed_at DESC;`),
  def('running-total', 'A running sum in date order', 'SQL', ['window'], `SELECT day, amount,
       SUM(amount) OVER (ORDER BY day) AS running_total
FROM daily_spend
ORDER BY day;`),
  def('monthly-totals', 'Totals for each month', 'SQL', ['aggregate', 'date'], `SELECT date_trunc('month', placed_at) AS month,
       COUNT(*) AS orders,
       SUM(total) AS revenue
FROM orders
GROUP BY month
ORDER BY month;`),
  def('find-duplicates', 'Rows that share a key', 'SQL', ['aggregate'], `SELECT email, COUNT(*) AS copies
FROM users
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY copies DESC;`),
  def('missing-foreign-keys', 'Children without a parent', 'SQL', ['join'], `SELECT orders.id
FROM orders
LEFT JOIN customers ON customers.id = orders.customer_id
WHERE customers.id IS NULL;`),
  def('slowest-queries', 'The slowest statements', 'SQL', ['postgres', 'performance'], `SELECT query, calls, total_exec_time / calls AS mean_ms
FROM pg_stat_statements
ORDER BY mean_ms DESC
LIMIT 20;`),
  def('index-size', 'Space used by each index', 'SQL', ['postgres', 'maintenance'], `SELECT indexrelname AS index, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;`),
  def('vacuum', 'Reclaim dead rows', 'SQL', ['postgres', 'maintenance'], `VACUUM (ANALYZE, VERBOSE) orders;`),
  def('cte-filter', 'A readable multi-step query', 'SQL', ['cte'], `WITH recent AS (
  SELECT * FROM orders WHERE placed_at > now() - interval '30 days'
)
SELECT customer_id, SUM(total) AS spent
FROM recent
GROUP BY customer_id
ORDER BY spent DESC;`),
  def('percent-of-total', 'Each row as a share of the total', 'SQL', ['window'], `SELECT service, amount,
       round(100 * amount / SUM(amount) OVER (), 2) AS share
FROM monthly_costs
ORDER BY amount DESC;`),
  def('median', 'The median value', 'SQL', ['aggregate', 'postgres'], `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS median_ms
FROM checks;`),
  def('soft-delete', 'Hide a row without removing it', 'SQL', ['update'], `UPDATE notes
SET deleted_at = now()
WHERE id = $1 AND deleted_at IS NULL;`),
  def('explain', 'Read a query plan', 'SQL', ['performance'], `EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders WHERE customer_id = $1;`),
  def('generate-series', 'One row per day in a range', 'SQL', ['postgres', 'date'], `SELECT day::date
FROM generate_series(
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month - 1 day',
  interval '1 day'
) AS day;`),
]

const SHELL: readonly Definition[] = [
  def('fail-fast', 'A strict shell header', 'Shell', ['shell', 'safety'], `#!/usr/bin/env bash
set -euo pipefail
IFS=$'\\n\\t'`),
  def('trap-cleanup', 'Clean up on exit', 'Shell', ['shell', 'cleanup'], `cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT`),
  def('temp-dir', 'A temporary folder that disappears', 'Shell', ['shell', 'file'], `tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT`),
  def('require-command', 'Check a command exists', 'Shell', ['shell', 'check'], `require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing: $1" >&2
    exit 1
  }
}`),
  def('find-large-files', 'The largest files under a folder', 'Shell', ['file', 'disk'], `find . -type f -size +100M -print0 |
  xargs -0 du -h |
  sort -rh |
  head -20`),
  def('tar-backup', 'A dated tar backup', 'Shell', ['backup', 'archive'], `tar czf "backup-$(date +%F).tar.gz" -C "$source" .`),
  def('port-in-use', 'Which process listens on a port', 'Shell', ['network', 'process'], `lsof -nP -iTCP:"$1" -sTCP:LISTEN`),
  def('wait-for-port', 'Wait until a port answers', 'Shell', ['network', 'health'], `for _ in $(seq 1 30); do
  nc -z 127.0.0.1 "$1" && exit 0
  sleep 1
done
echo "port $1 did not open" >&2
exit 1`),
  def('git-branch-cleanup', 'Delete merged local branches', 'Shell', ['git', 'cleanup'], `git branch --merged main |
  grep -v '\\*\\|main' |
  xargs -r git branch -d`),
  def('json-pretty', 'Pretty-print JSON from a pipe', 'Shell', ['json', 'format'], `jq . "$1"`),
  def('count-lines', 'Lines per file in a folder', 'Shell', ['file', 'count'], `find . -name '*.ts' -print0 | xargs -0 wc -l | sort -n`),
]

const ALL: readonly Definition[] = [...TYPESCRIPT, ...JAVASCRIPT, ...PYTHON, ...SQL, ...SHELL]

/** The collections a new install starts with, by title. */
const COLLECTIONS: readonly { name: string; titles: readonly string[] }[] = [
  {
    name: 'API patterns',
    titles: ['retry-with-backoff', 'safe-fetch', 'fetch-json', 'post-json', 'parse-query'],
  },
  {
    name: 'React hooks',
    titles: ['use-debounced-value', 'debounce', 'throttle', 'on-ready', 'delegate'],
  },
  {
    name: 'Database recipes',
    titles: ['postgres-json-merge', 'upsert', 'top-n-per-group', 'running-total', 'monthly-totals', 'vacuum'],
  },
]

/** The twelve favourites a new install starts with. */
const STARRED = new Set([
  'retry-with-backoff',
  'safe-fetch',
  'use-debounced-value',
  'postgres-json-merge',
  'upsert',
  'parse-env-file',
  'csv-to-dict',
  'fail-fast',
  'trap-cleanup',
  'top-n-per-group',
  'human-duration',
  'copy-text',
])

/**
 * The seed, stamped around `now`: the first few snippets were changed hours ago, the rest over the past months, so "recently edited" means
 * something on the first start. `newId` names the rows, so the seed is the same in every test.
 */
export function seed(now: Date, newId: (kind: string) => string): SnippetsState {
  const base = now.getTime()
  /** The six the mockup shows first, with the ages it shows them at; every other snippet is older. */
  const RECENT: Readonly<Record<string, number>> = {
    'retry-with-backoff': 125,
    'use-debounced-value': 60 * 26,
    'postgres-json-merge': 60 * 24 * 6,
    'safe-fetch': 60 * 24 * 7,
    'parse-env-file': 60 * 24 * 9,
    'csv-to-dict': 60 * 24 * 10,
  }
  const ageMinutes = (definition: Definition, index: number): number =>
    RECENT[definition.title] ?? 60 * 24 * (10 + index * 2)
  const snippets: Snippet[] = ALL.map((definition, index) => {
    const updatedAt = new Date(base - ageMinutes(definition, index) * 60_000)
    const createdAt = new Date(updatedAt.getTime() - 1000 * 60 * 60 * 24 * 3)
    const stamp = (date: Date): string =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    return {
      id: newId('snippet'),
      title: definition.title,
      description: definition.description,
      language: definition.language,
      code: definition.code,
      tags: [...definition.tags],
      variables: variablesOf(definition.code),
      createdAt: stamp(createdAt),
      updatedAt: stamp(updatedAt),
      starred: STARRED.has(definition.title),
    }
  })
  const byTitle = new Map(snippets.map((snippet) => [snippet.title, snippet.id]))
  const collections: Collection[] = COLLECTIONS.map((collection) => ({
    id: newId('collection'),
    name: collection.name,
    snippetIds: collection.titles.flatMap((title) => {
      const id = byTitle.get(title)
      return id === undefined ? [] : [id]
    }),
  }))
  return { version: 1, snippets, collections }
}
