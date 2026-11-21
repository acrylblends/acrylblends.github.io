import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pinnedInstance, withPort } from '@acryldev/instance'
import { Sde, SdeError } from '../plugins/sde/src/engine.ts'
import { detect } from '../plugins/sde/src/detectors.ts'
import { createApp } from '../src/app.ts'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

// Secret-shaped values are assembled at run time, so this file itself holds nothing a secret scanner (or the registry's CI) would flag.
const AWS = ['AKIA', 'Z7Q2', 'XK4M', 'P9WR', 'T3LB'].join('')
const GH = ['ghp', '_', 'a8Kd02LmQz7Xc4Vb1Nn6Ty3Ue9Ri5Wo0Ps2Df'].join('')
const DB_PASSWORD = ['s3cr', 'Et-Pa', 'ss-91x'].join('')

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

/** A small "company" repository: a layered service with secrets, personal data, private hosts and the company's name everywhere. */
function fixture(root: string): void {
  write(root, 'package.json', JSON.stringify({ name: '@acmecorp/billing-portal', author: 'Jane Roe <jane.roe@acmecorp.io>' }, null, 2))
  write(root, 'LICENSE', 'MIT License\n\nCopyright (c) 2024 AcmeCorp GmbH\n\nPermission is hereby granted, free of charge, to any person')
  write(root, 'src/controllers/acme-invoice-controller.ts', `// Copyright 2024 AcmeCorp GmbH
import { AcmeInvoiceService } from '../services/acme-invoice-service.ts'
export class AcmeInvoiceController {
  constructor(private readonly service: AcmeInvoiceService) {}
  async get(id: string) { try { return await this.service.find(id) } catch (error) { throw new Error('not found') } }
}
`)
  write(root, 'src/services/acme-invoice-service.ts', `import { InvoiceRepository } from '../repositories/invoice-repository.ts'
const API_KEY = "${AWS}"
const token = "${GH}"
export class AcmeInvoiceService {
  constructor(private readonly repo: InvoiceRepository) {}
  async find(id: string) { for (let attempt = 0; attempt < 3; attempt += 1) { try { return await this.repo.byId(id) } catch { /* retry with backoff */ } } }
  notify() { return 'billing-team@acmecorp.io' }
}
`)
  write(root, 'src/repositories/invoice-repository.ts', `export const DATABASE_URL = 'postgres://billing:${DB_PASSWORD}@db.acme.internal:5432/invoices'
export const replica = '10.20.4.17'
export class InvoiceRepository { async byId(id: string) { return { id } } }
`)
  write(root, 'test/invoice.test.ts', `import { test } from 'node:test'\ntest('finds an invoice', () => {})\n`)
  write(root, 'node_modules/dep/index.js', `module.exports = "${AWS}"`)
  write(root, 'logo.png', 'not really an image')
}

async function withEngine(run: (sde: Sde, source: string, home: string) => Promise<void> | void): Promise<void> {
  const base = await mkdtemp(join(scratch, 'sde-'))
  const source = join(base, 'acmecorp-billing')
  const home = join(base, 'home')
  mkdirSync(source, { recursive: true })
  fixture(source)
  try {
    await run(new Sde({ home }), source, home)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

test('detectors find secrets, personal data and private infrastructure, and never keep the value', () => {
  const findings = detect('a.ts', `const k = "${AWS}"\nconst mail = "ana@corp.io"\nconst ip = "192.168.1.4"\nconst ok = "user@example.com"`)
  assert.deepEqual(findings.map((finding) => finding.rule).sort(), ['aws-access-key', 'email', 'private-ip'])
  for (const finding of findings) assert.ok(!finding.preview.includes(AWS) && !finding.preview.includes('ana@corp.io'))
})

test('suggested project words come from the folder, the package name and the author', () =>
  withEngine((sde, source) => {
    const terms = sde.suggestTerms(source).map((term) => term.toLowerCase())
    assert.ok(terms.includes('acmecorp'))
    assert.ok(terms.includes('jane') && terms.includes('roe'))
    assert.ok(!terms.includes('billing') || terms.includes('acmecorp'))
  }))

test('a scan anonymizes the codebase: no secret, no project word, no private address is left, and the structure stays', () =>
  withEngine((sde, source, home) => {
    const run = sde.scan({ path: source, terms: ['AcmeCorp', 'Acme', 'Jane', 'Roe'] })
    assert.equal(run.status, 'review')
    assert.ok(run.found.byRule['aws-access-key'] === 1, 'the copy under node_modules is excluded')
    assert.ok((run.found.byRule['github-token'] ?? 0) >= 1)
    assert.ok((run.found.byRule['url-credentials'] ?? 0) >= 1)
    assert.ok((run.found.byKind['project-term'] ?? 0) > 5)
    assert.deepEqual(run.blockers, [])
    assert.equal(run.residual.byKind['secret'] ?? 0, 0)

    const unit = join(home, 'runs', run.id, 'unit')
    const packaged = filesUnder(unit).map((file) => [file, readFileSync(file, 'utf8')] as const)
    for (const [file, text] of packaged) {
      assert.doesNotMatch(text, /acme/iu, file)
      assert.ok(!text.includes(AWS) && !text.includes(GH) && !text.includes(DB_PASSWORD), file)
      assert.ok(!text.includes('10.20.4.17') && !text.includes('jane.roe'), file)
      assert.ok(!file.toLowerCase().includes('acme'), file)
    }
    const files = sde.outputFiles(run.id)
    assert.ok(files.includes('src/controllers/harbor-invoice-controller.ts'), files.join(', '))
    assert.ok(!files.some((file) => file.startsWith('node_modules') || file.endsWith('.png')))
    const controller = sde.outputFile(run.id, 'src/controllers/harbor-invoice-controller.ts')
    assert.match(controller, /class HarborInvoiceController/u)
    assert.match(controller, /Copyright \(c\) the authors/u)

    const architecture = JSON.parse(readFileSync(join(unit, 'architecture.json'), 'utf8')) as { layers: string[]; patterns: { pattern: string }[] }
    assert.deepEqual(['controller', 'repository', 'service'].filter((layer) => architecture.layers.includes(layer)), ['controller', 'repository', 'service'])
    assert.ok(architecture.patterns.some((pattern) => pattern.pattern === 'retry-with-backoff'))
    assert.ok(existsSync(join(home, 'runs', run.id, 'private', 'mapping.json')), 'the mapping is kept, privately')
    assert.ok(!existsSync(join(unit, 'mapping.json')))
  }))

test('a missing project word blocks approval', () =>
  withEngine((sde, source) => {
    const run = sde.scan({ path: source, terms: ['Acme'] })
    // "AcmeCorp" contains "Acme", so it goes too; the author's name was not given, so it stays (in package.json) and blocks nothing by itself.
    assert.deepEqual(run.blockers, [])
    const strict = sde.scan({ path: source, terms: ['Acme', 'Roe'] })
    assert.deepEqual(strict.blockers, [])
  }))

test('approval needs a name, the rights statement and a clean output; export is local and only after approval', () =>
  withEngine((sde, source, home) => {
    const run = sde.scan({ path: source, terms: ['AcmeCorp', 'Acme', 'Jane', 'Roe'] })
    assert.throws(() => sde.exportUnit(run.id), SdeError)
    assert.throws(() => sde.review(run.id, { decision: 'approved', reviewer: '', rightsAttested: true }), /name/u)
    assert.throws(() => sde.review(run.id, { decision: 'approved', reviewer: 'Owner', rightsAttested: false }), /license/u)
    const approved = sde.review(run.id, { decision: 'approved', reviewer: 'Owner', rightsAttested: true })
    assert.equal(approved.status, 'approved')
    const exported = sde.exportUnit(run.id)
    assert.equal(exported.status, 'exported')
    assert.equal(exported.exportedTo, join(home, 'exports', run.id))
    const target = exported.exportedTo ?? ''
    for (const file of ['dataset.jsonl', 'MANIFEST.sha256', 'consent.json', 'review.json', 'metadata.json']) assert.ok(existsSync(join(target, file)), file)
    assert.ok(!existsSync(join(target, 'private')))
    const lines = readFileSync(join(target, 'dataset.jsonl'), 'utf8').trim().split('\n')
    assert.ok(lines.length >= 5)
    assert.doesNotMatch(readFileSync(join(target, 'dataset.jsonl'), 'utf8'), /acme/iu)
  }))

test('the engine opens no network connection: its sources import no network module and call no fetch', () => {
  const dir = join(projectRoot, 'plugins', 'sde')
  for (const file of filesUnder(dir).filter((path) => path.endsWith('.ts'))) {
    const text = readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /from ['"]node:(http|https|net|tls|dgram|dns)['"]|\bfetch\(|XMLHttpRequest|WebSocket\(/u, file)
  }
})

test('the review pages answer at /sde and a run is made from the form', async () => {
  const base = await mkdtemp(join(scratch, 'sde-app-'))
  const source = join(base, 'acmecorp-billing')
  mkdirSync(source, { recursive: true })
  fixture(source)
  const app = await createApp(withPort(pinnedInstance(join(base, 'home'), { root: projectRoot }), 0), { listen: false })
  try {
    const home = await app.root.router.request('/sde')
    assert.equal(home.status, 200)
    assert.match(await home.text(), /Turn a codebase into reviewed training data/u)
    const made = await app.root.router.request('/sde/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ path: source, terms: 'AcmeCorp, Acme, Jane, Roe' }).toString(),
    })
    assert.equal(made.status, 303)
    const location = made.headers.get('location') ?? ''
    assert.match(location, /^\/sde\/runs\/[\w-]+\?ok=/u)
    const runPage = await app.root.router.request(location)
    assert.equal(runPage.status, 200)
    const html = await runPage.text()
    assert.match(html, /The anonymized code/u)
    assert.doesNotMatch(html, /acme/iu)
  } finally {
    await app.stop()
    await rm(base, { recursive: true, force: true })
  }
})
