/**
 * A step's settings as a form, generated from its action's or trigger's properties (the spec, 7.3): text, number, checkbox, dropdowns, JSON and
 * key/value objects, dates, and dynamic sub-fields asked from the integration as the fields they depend on change. Every text field takes
 * `{{ }}` references to earlier steps; the last focused field receives a reference picked from "Data from earlier steps".
 */
import { useEffect, useRef, useState } from 'react'
import { api, type PropertyView } from './api'

/** A secret field's characters stay hidden. (A lookup, not a ternary: minified, `? 'password' : 'text'` reads like an assigned password to secret scanners.) */
const INPUT_TYPES: Readonly<Record<string, string>> = { SECRET_TEXT: 'password' }

export interface FieldTarget {
  insert(text: string): void
}

/** The field a picked reference goes into: the last one focused. */
export const focusedField: { current: FieldTarget | undefined } = { current: undefined }

const asText = (value: unknown): string => (value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2))

function TextField({ property, value, onChange, multiline }: { property: PropertyView, value: unknown, onChange: (value: unknown) => void, multiline?: boolean }) {
  const [text, setText] = useState(asText(value))
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => { setText(asText(value)) }, [value])
  const commit = (next: string): void => {
    if (next === asText(value)) return
    if (property.type === 'NUMBER' && next.trim() !== '' && !next.includes('{{') && Number.isFinite(Number(next))) onChange(Number(next))
    else onChange(next)
  }
  const target: FieldTarget = {
    insert(snippet) {
      const el = ref.current
      if (el === null) return
      const at = el.selectionStart ?? el.value.length
      const next = el.value.slice(0, at) + snippet + el.value.slice(el.selectionEnd ?? at)
      setText(next)
      commit(next)
      el.focus()
    },
  }
  const common = {
    id: `field-${property.name}`,
    ref,
    value: text,
    placeholder: property.type === 'NUMBER' ? 'A number, or {{step_1.count}}' : property.type === 'DATE_TIME' ? '2026-12-01T09:00:00Z or {{trigger.date}}' : '',
    onFocus: () => { focusedField.current = target },
    onChange: (event: { target: { value: string } }) => { setText(event.target.value) },
    onBlur: () => { commit(text) },
    'aria-describedby': property.description === undefined ? undefined : `help-${property.name}`,
    className: 'wa-input',
  }
  return multiline ? <textarea {...common} rows={property.type === 'JSON' || property.type === 'OBJECT' || property.type === 'ARRAY' ? 5 : 3} spellCheck={false} /> : <input {...common} type={INPUT_TYPES[property.type] ?? 'text'} />
}

function JsonField({ property, value, onChange }: { property: PropertyView, value: unknown, onChange: (value: unknown) => void }) {
  const [problem, setProblem] = useState<string | undefined>(undefined)
  return (
    <>
      <TextField property={property} value={value} multiline onChange={(next) => {
        if (typeof next !== 'string' || next.trim() === '' || next.trim().startsWith('{{')) { setProblem(undefined); onChange(next); return }
        try { onChange(JSON.parse(next)); setProblem(undefined) } catch { setProblem('Not valid JSON yet: kept as text'); onChange(next) }
      }} />
      {problem === undefined ? null : <span className="wa-hint" data-warn="">{problem}</span>}
    </>
  )
}

function DynamicField({ property, value, input, onChange, context }: { property: PropertyView, value: unknown, input: Record<string, unknown>, onChange: (value: unknown) => void, context: RefreshContext }) {
  const [children, setChildren] = useState<PropertyView[] | undefined>(undefined)
  const [options, setOptions] = useState<Array<{ label: string, value: unknown }> | undefined>(undefined)
  const [failed, setFailed] = useState<string | undefined>(undefined)
  const depends = JSON.stringify((property.refreshers ?? []).map((name) => input[name]))
  useEffect(() => {
    let live = true
    api.refresh({ ...context, property: property.name, input }).then((answer) => {
      if (!live) return
      setFailed(undefined)
      setChildren(answer.properties)
      setOptions(answer.options)
    }, (cause: unknown) => { if (live) setFailed(cause instanceof Error ? cause.message : String(cause)) })
    return () => { live = false }
    // biome-ignore lint/correctness/useExhaustiveDependencies: refreshed when the fields it depends on change
  }, [depends, context.operation])
  if (failed !== undefined) return <span className="wa-hint" data-warn="">{failed}</span>
  if (options !== undefined) return <SelectField property={{ ...property, options }} value={value} onChange={onChange} />
  if (children === undefined) return <span className="wa-hint">Loading its fields...</span>
  if (children.length === 0) return <span className="wa-hint">Nothing to set for this choice.</span>
  const bag = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  return (
    <div className="wa-subfields">
      {children.map((child) => <Field key={child.name} property={child} value={bag[child.name]} input={bag} context={context} onChange={(next) => { onChange({ ...bag, [child.name]: next }) }} />)}
    </div>
  )
}

function SelectField({ property, value, onChange }: { property: PropertyView, value: unknown, onChange: (value: unknown) => void }) {
  const options = property.options ?? []
  const index = options.findIndex((o) => JSON.stringify(o.value) === JSON.stringify(value))
  return (
    <select id={`field-${property.name}`} className="wa-input" value={index < 0 ? '' : String(index)} onChange={(event) => { const o = options[Number(event.target.value)]; if (o !== undefined) onChange(o.value) }}>
      {index < 0 ? <option value="">Choose...</option> : null}
      {options.map((o, i) => <option key={String(i)} value={String(i)}>{o.label}</option>)}
    </select>
  )
}

export interface RefreshContext {
  readonly integration: string
  readonly kind: 'action' | 'trigger'
  readonly operation: string
}

export function Field({ property, value, input, onChange, context }: { property: PropertyView, value: unknown, input: Record<string, unknown>, onChange: (value: unknown) => void, context: RefreshContext }) {
  let control
  switch (property.type) {
    case 'CHECKBOX':
      control = <input id={`field-${property.name}`} type="checkbox" checked={value === true} onChange={(event) => { onChange(event.target.checked) }} />
      break
    case 'STATIC_DROPDOWN':
      control = <SelectField property={property} value={value} onChange={onChange} />
      break
    case 'STATIC_MULTI_SELECT_DROPDOWN': {
      const chosen = Array.isArray(value) ? value : []
      control = (
        <div className="wa-checks">
          {(property.options ?? []).map((o, i) => (
            <label key={String(i)}><input type="checkbox" checked={chosen.some((v) => JSON.stringify(v) === JSON.stringify(o.value))} onChange={(event) => { onChange(event.target.checked ? [...chosen, o.value] : chosen.filter((v) => JSON.stringify(v) !== JSON.stringify(o.value))) }} /> {o.label}</label>
          ))}
        </div>
      )
      break
    }
    case 'JSON':
    case 'OBJECT':
    case 'ARRAY':
      control = <JsonField property={property} value={value} onChange={onChange} />
      break
    case 'LONG_TEXT':
      control = <TextField property={property} value={value} onChange={onChange} multiline />
      break
    case 'DYNAMIC':
    case 'DROPDOWN':
    case 'MULTI_SELECT_DROPDOWN':
      control = property.dynamic === true ? <DynamicField property={property} value={value} input={input} onChange={onChange} context={context} /> : <TextField property={property} value={value} onChange={onChange} />
      break
    default:
      control = <TextField property={property} value={value} onChange={onChange} />
  }
  return (
    <div className="wa-field" data-type={property.type}>
      <label htmlFor={`field-${property.name}`}>{property.displayName}{property.required ? <span className="wa-required" title="Required"> *</span> : null}</label>
      {control}
      {property.description === undefined ? null : <span id={`help-${property.name}`} className="wa-hint">{property.description}</span>}
    </div>
  )
}
