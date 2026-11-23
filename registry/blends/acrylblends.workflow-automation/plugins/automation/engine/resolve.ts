/**
 * Resolves `{{ ... }}` in a step's input against the run so far: `{{trigger.body.email}}`, `{{step_1['items'][0].id}}`, a whole value when the input is
 * one token, text when the token sits inside text, and Qadam's formulas (`formulaEvaluator`, from @aiqadam/shared).
 *
 * Ported from Qadam Flow (MIT) packages/server/engine/src/lib/variables/props-resolver.ts @ 51bb340b (itself from Activepieces, MIT; see NOTICE):
 * the token walk, `resolveInputAsync`, `flattenNestedKeys`, the merging of flattened arrays and the formula pre-resolution are theirs. What differs, by
 * design: Qadam evaluates a token as JavaScript in a code sandbox; here a token is only ever a path (names, `.key`, `['key']`, `[0]`) read from the
 * run's data, and `flattenNestedKeys(path, ['a','b'])`. Nothing in a workflow is ever run as code (the spec, 6.4 and 11.3). Project variables and
 * translations (`{{variables...}}`, `{{$t...}}`) belong to Qadam's server and are refused with a sentence.
 */
import { applyFunctionToValues, extractMustacheTokens, FormulaEvaluationError, formulaEvaluator, isNil, isString, UnresolvedTemplateReferenceError } from '@aiqadam/shared'

const CONNECTIONS = 'connections'
const FLATTEN_NESTED_KEYS_PATTERN = /\{\{\s*flattenNestedKeys(.*?)\}\}/g

/** What a token can read: each step's output by its name (`trigger`, `step_1`, ...). */
export type RunState = Readonly<Record<string, unknown>>

export interface ResolveOptions {
  readonly state: RunState
  /** Every step of the workflow, so a typo (`{{step_9}}`) fails instead of quietly becoming ''. */
  readonly stepNames: readonly string[]
  /** `{{connections['name']}}`: a connection's value, or its masked form when `censored`. */
  readonly connection?: (name: string, censored: boolean) => unknown
}

export interface Resolved<T> {
  readonly resolvedInput: T
  /** The same input with connection values masked: what a run's record keeps and an agent sees. */
  readonly censoredInput: unknown
}

/** Resolve every string in `input` (objects and arrays walked). */
export async function resolveInput<T = unknown>(input: unknown, options: ResolveOptions): Promise<Resolved<T>> {
  if (isNil(input)) return { resolvedInput: input as T, censoredInput: input }
  const resolvedInput = await applyFunctionToValues<T>(input, (token) => resolveInputAsync(token, options, false))
  const censoredInput = await applyFunctionToValues<T>(input, (token) => resolveInputAsync(token, options, true))
  return { resolvedInput, censoredInput }
}

export async function resolveInputAsync(input: string, options: ResolveOptions, censored: boolean): Promise<unknown> {
  if (formulaEvaluator.containsWrapper(input)) {
    const { expression, vars } = await preResolveFormulaVars(input, options, censored)
    const { result, error } = formulaEvaluator.evaluate({ expression, sampleData: vars })
    if (error) throw new FormulaEvaluationError({ expression: input, message: error })
    return result ?? ''
  }
  const tokens = extractMustacheTokens(input)
  if (tokens.length === 1 && tokens[0]!.token === input) return resolveSingleToken(tokens[0]!.inner.trim(), options, censored)
  if (!isNil(input.match(FLATTEN_NESTED_KEYS_PATTERN)) && tokens.length > 0) return mergeFlattenedKeysArraysIntoOneArray(input, tokens.map((t) => t.token), options, censored)
  let result = ''
  let lastIndex = 0
  for (const { token, inner, index } of tokens) {
    result += input.slice(lastIndex, index)
    const value = await resolveSingleToken(inner.trim(), options, censored)
    result += isString(value) ? value : JSON.stringify(value)
    lastIndex = index + token.length
  }
  return result + input.slice(lastIndex)
}

async function resolveSingleToken(variableName: string, options: ResolveOptions, censored: boolean): Promise<unknown> {
  if (variableName.startsWith(CONNECTIONS)) {
    const name = /^connections\[(['"])([^'"]+)\1\]$/u.exec(variableName)?.[2] ?? /^connections\.([A-Za-z0-9_-]+)$/u.exec(variableName)?.[1]
    if (name === undefined || options.connection === undefined) throw new UnresolvedTemplateReferenceError({ expression: variableName })
    return options.connection(name, censored)
  }
  if (/^(variables|\$t)\b/u.test(variableName))
    throw new UnresolvedTemplateReferenceError({ expression: variableName, reference: variableName.split(/[.[]/u)[0] })
  return readPath(variableName, options)
}

/** One token as a path, or `flattenNestedKeys(path, ['a', 'b'])`. Anything else is refused: a token is never run as code. */
function readPath(expression: string, options: ResolveOptions): unknown {
  const flatten = /^flattenNestedKeys\((.+),\s*\[(.*)\]\s*\)$/su.exec(expression)
  if (flatten !== null) {
    const keys = [...flatten[2]!.matchAll(/(['"])([^'"]*)\1/gu)].map((m) => m[2]!)
    return flattenNestedKeys(readPath(flatten[1]!.trim(), options), keys)
  }
  const parts = parsePath(expression)
  if (parts === undefined) throw new UnresolvedTemplateReferenceError({ expression, cause: new Error('only a path is allowed in {{ }}: trigger.body.name, step_1[\'items\'][0]; compute with a formula') })
  const [root, ...rest] = parts
  if (!Object.hasOwn(options.state, root!)) {
    // A step that exists but has not run (a branch not taken, a step further down) reads as ''; a name that is no step is a mistake (Qadam #392).
    if (options.stepNames.length > 0 && !options.stepNames.includes(String(root))) throw new UnresolvedTemplateReferenceError({ expression, reference: String(root) })
    return ''
  }
  let value: unknown = options.state[root!]
  for (const part of rest) {
    if (value === null || value === undefined || typeof value !== 'object') return ''
    if (!Object.hasOwn(value, part)) return ''
    value = (value as Record<string | number, unknown>)[part]
  }
  return value ?? ''
}

/** `a.b['c'][0].1x` as ['a', 'b', 'c', 0, '1x'], or undefined when it is not a plain path. */
export function parsePath(expression: string): Array<string | number> | undefined {
  const parts: Array<string | number> = []
  const name = /^[A-Za-z_$][\w$]*/u.exec(expression)
  if (name === null) return undefined
  parts.push(name[0])
  let rest = expression.slice(name[0].length)
  while (rest !== '') {
    const dot = /^\s*\.\s*([\w$]+)/u.exec(rest)
    if (dot !== null) { parts.push(dot[1]!); rest = rest.slice(dot[0].length); continue }
    const quoted = /^\s*\[\s*(['"])((?:\\.|(?!\1).)*)\1\s*\]/u.exec(rest)
    if (quoted !== null) { parts.push(quoted[2]!.replaceAll(/\\(.)/gu, '$1')); rest = rest.slice(quoted[0].length); continue }
    const index = /^\s*\[\s*(\d+)\s*\]/u.exec(rest)
    if (index !== null) { parts.push(Number(index[1])); rest = rest.slice(index[0].length); continue }
    if (/^\s+$/u.test(rest)) break
    return undefined
  }
  return parts
}

function flattenNestedKeys(data: unknown, pathToMatch: string[]): unknown[] {
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key === pathToMatch[0]) return flattenNestedKeys(value, pathToMatch.slice(1))
    }
  } else if (Array.isArray(data)) {
    return data.flatMap((d) => flattenNestedKeys(d, pathToMatch))
  } else if (pathToMatch.length === 0) {
    return [data]
  }
  return []
}

async function mergeFlattenedKeysArraysIntoOneArray(token: string, parts: string[], options: ResolveOptions, censored: boolean): Promise<unknown[]> {
  const resolvedValues: Record<string, unknown> = {}
  let longest = 0
  for (const part of parts) {
    resolvedValues[part] = await resolveSingleToken(part.substring(2, part.length - 2).trim(), options, censored)
    const value = resolvedValues[part]
    if (Array.isArray(value)) longest = Math.max(longest, value.length)
  }
  return new Array(longest).fill(null).map((_, index) => Object.entries(resolvedValues).reduce((acc, [part, value]) => {
    const use = (Array.isArray(value) ? value[index] : value) ?? ''
    return acc.replace(part, isString(use) ? use : JSON.stringify(use))
  }, token))
}

async function preResolveFormulaVars(expression: string, options: ResolveOptions, censored: boolean): Promise<{ expression: string, vars: Record<string, unknown> }> {
  const keyOf = new Map<string, string>()
  const rewritten = expression.replace(/\{\{([^}]+)\}\}/gu, (_, raw: string) => {
    const name = raw.trim()
    let key = keyOf.get(name)
    if (key === undefined) { key = `__ap_pv${keyOf.size}__`; keyOf.set(name, key) }
    return `{{${key}}}`
  })
  const vars: Record<string, unknown> = {}
  for (const [name, key] of keyOf) vars[key] = await resolveSingleToken(name, options, censored)
  return { expression: rewritten, vars }
}
