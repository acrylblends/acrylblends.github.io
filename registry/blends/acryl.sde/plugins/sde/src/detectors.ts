/**
 * Privacy and security detectors: secrets, personal data, private infrastructure, project fingerprints and risky code. A finding never carries
 * the value it found, only a masked preview (the first characters and the length), so a report can be read and shared without exposing it.
 */
export type FindingKind = 'secret' | 'personal-data' | 'infrastructure' | 'fingerprint' | 'project-term' | 'security'
export type Severity = 'high' | 'medium' | 'low'

export interface Finding {
  readonly kind: FindingKind
  readonly rule: string
  readonly severity: Severity
  readonly path: string
  readonly line: number
  /** The value masked: its first 3 characters, then `*`, and its length. */
  readonly preview: string
}

interface Rule {
  readonly kind: FindingKind
  readonly rule: string
  readonly severity: Severity
  readonly pattern: RegExp
  /** The capture group holding the sensitive value (0: the whole match). */
  readonly group?: number
  /** A match this returns false for is not a finding (a placeholder, an example value). */
  readonly accept?: (value: string) => boolean
}

const PLACEHOLDER = /^(x+|\*+|\.{3}|<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\}|changeme|change_me|example|your[-_ ]?\w*|test|dummy|redacted\w*|placeholder|null|none|undefined|process\.env\.\w+|os\.environ.*)$/iu

/** Shannon entropy in bits per character: random keys are high, words and placeholders are low. */
export function entropy(value: string): number {
  const counts = new Map<string, number>()
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1)
  let bits = 0
  for (const count of counts.values()) {
    const p = count / value.length
    bits -= p * Math.log2(p)
  }
  return bits
}

const notPlaceholder = (value: string): boolean => !PLACEHOLDER.test(value.trim())

const PUBLIC_EMAIL_DOMAINS = /@(example\.(com|org|net)|test\.com|localhost|users\.noreply\.github\.com)$/iu

/** Private address ranges (RFC 1918, loopback is left alone: it names no one's network). */
function isPrivateIp(ip: string): boolean {
  const [a = 0, b = 0] = ip.split('.').map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

export const RULES: readonly Rule[] = [
  { kind: 'secret', rule: 'private-key', severity: 'high', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/gu },
  { kind: 'secret', rule: 'aws-access-key', severity: 'high', pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/gu },
  { kind: 'secret', rule: 'github-token', severity: 'high', pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/gu },
  { kind: 'secret', rule: 'gitlab-token', severity: 'high', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/gu },
  { kind: 'secret', rule: 'slack-token', severity: 'high', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/gu },
  { kind: 'secret', rule: 'stripe-key', severity: 'high', pattern: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/gu },
  { kind: 'secret', rule: 'google-api-key', severity: 'high', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/gu },
  { kind: 'secret', rule: 'openai-key', severity: 'high', pattern: /\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/gu },
  { kind: 'secret', rule: 'anthropic-key', severity: 'high', pattern: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/gu },
  { kind: 'secret', rule: 'jwt', severity: 'medium', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu },
  {
    kind: 'secret', rule: 'url-credentials', severity: 'high', group: 1,
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"]+:([^\s@'"/]{3,})@/giu, accept: notPlaceholder,
  },
  {
    kind: 'secret', rule: 'assigned-secret', severity: 'high', group: 2,
    pattern: /\b([A-Za-z0-9_]*(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key))\s*[:=]\s*['"]([^'"\s]{8,})['"]/giu,
    accept: (value) => notPlaceholder(value) && entropy(value) >= 3,
  },
  {
    kind: 'personal-data', rule: 'email', severity: 'medium',
    // A URL's `user:password@host` is the url-credentials rule's, not an address: an anonymized one (`REDACTED_...@host`) is not an email either.
    pattern: /(?<![:/\w.%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu,
    accept: (value) => !PUBLIC_EMAIL_DOMAINS.test(value) && !/^REDACTED_/u.test(value),
  },
  { kind: 'personal-data', rule: 'phone', severity: 'medium', pattern: /(?<![\w.])\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/gu },
  { kind: 'personal-data', rule: 'iban', severity: 'high', pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/gu, accept: (value) => /\d{6}/u.test(value.replace(/\s/gu, '')) },
  { kind: 'infrastructure', rule: 'private-ip', severity: 'medium', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, accept: isPrivateIp },
  {
    kind: 'infrastructure', rule: 'internal-host', severity: 'medium',
    pattern: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(internal|local|corp|lan|intranet|private)\b/giu,
  },
  { kind: 'infrastructure', rule: 'cloud-resource-id', severity: 'low', pattern: /\barn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{12}:[^\s'"]+/gu },
  { kind: 'fingerprint', rule: 'copyright', severity: 'low', pattern: /\bcopyright\s+(?:\(c\)\s*|©\s*)?\d{4}[^\n]*/giu },
  { kind: 'fingerprint', rule: 'author-tag', severity: 'low', pattern: /@author\s+[^\n*]+/gu },
  { kind: 'security', rule: 'dynamic-eval', severity: 'medium', pattern: /\b(eval|new Function)\s*\(/gu },
  { kind: 'security', rule: 'shell-exec', severity: 'medium', pattern: /\b(child_process\.exec|execSync|os\.system|subprocess\.(call|run|Popen)\([^)]*shell\s*=\s*True)/gu },
  { kind: 'security', rule: 'tls-verification-off', severity: 'high', pattern: /(rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0)/gu },
  { kind: 'security', rule: 'sql-string-concat', severity: 'medium', pattern: /\b(SELECT|INSERT|UPDATE|DELETE)\b[^'"`\n]*['"`]\s*\+\s*\w+/gu },
]

/** A value shown without being disclosed. */
export function mask(value: string): string {
  const visible = value.length > 12 ? 3 : value.length > 6 ? 2 : 1
  return `${value.slice(0, visible)}${'*'.repeat(6)} (${String(value.length)} chars)`
}

/** The line number (from 1) at a character offset. */
function lineAt(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1
  return line
}

/** Every finding in one file's text. `terms` are the project's own words (company, product, customer names). */
export function detect(path: string, text: string, terms: readonly string[] = []): Finding[] {
  const findings: Finding[] = []
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const value = match[rule.group ?? 0] ?? match[0]
      if (rule.accept && !rule.accept(value)) continue
      findings.push({ kind: rule.kind, rule: rule.rule, severity: rule.severity, path, line: lineAt(text, match.index ?? 0), preview: mask(value) })
    }
  }
  for (const term of terms) {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu')
    for (const match of text.matchAll(pattern)) {
      findings.push({ kind: 'project-term', rule: 'project-term', severity: 'medium', path, line: lineAt(text, match.index ?? 0), preview: mask(match[0]) })
    }
  }
  return findings
}

export interface FindingSummary {
  readonly total: number
  readonly byKind: Readonly<Record<string, number>>
  readonly byRule: Readonly<Record<string, number>>
  readonly bySeverity: Readonly<Record<string, number>>
  readonly files: number
}

export function summarize(findings: readonly Finding[]): FindingSummary {
  const count = (key: (finding: Finding) => string): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const finding of findings) out[key(finding)] = (out[key(finding)] ?? 0) + 1
    return out
  }
  return {
    total: findings.length,
    byKind: count((finding) => finding.kind),
    byRule: count((finding) => finding.rule),
    bySeverity: count((finding) => finding.severity),
    files: new Set(findings.map((finding) => finding.path)).size,
  }
}
