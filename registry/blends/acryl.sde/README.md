# ACRYL SDE

**ACRYL SDE**, the Synthetic Data Engine. Registry id `acryl.sde`. Source: <https://github.com/acrylblends/05-acryl-sde>. Page: <https://acrylblends.github.io/blends/ai/sde/acryl.sde>. A fork of [ACRYL ADE](https://acrylblends.github.io/blends/ai/ade/acryl.ade), source <https://github.com/acrylblends/05-acryl-ade>
(`acryl.ade`, the ACRYL IDE as a Blend) with one plugin added: `plugins/sde`.

Point it at a codebase and it makes a **Training Unit**: the code with everything that identifies the project, its people and its secrets
removed, the engineering kept, its architecture described, and reports a buyer can check. You review every unit. Only a unit you approved is
exported, and only to a folder on this machine. The engine opens no network connection.

## The pipeline (first version)

1. **Scan**: every file in the folder is listed and read as text. The project's code is never run, imported or installed. Dependencies, build output, caches, VCS folders, binaries and lock files are skipped (`plugins/sde/src/policy.ts`).
2. **Detect**: secrets (private keys, cloud and API keys, tokens, URL passwords, assigned secrets), personal data (emails, phone numbers, IBANs), private infrastructure (private IPs, internal hosts, cloud resource ids), fingerprints (copyright and author lines), the project's own words, and risky code (eval, shell exec, TLS checks off, SQL string building). A finding keeps a masked preview, never the value.
3. **Anonymize**: secrets become named placeholders, personal data and hosts become reserved example values (`example.com`, `192.0.2.0/24`, `+1-555-01xx`), and the project's words become neutral names in the same case, inside identifiers and file names too (`AcmeInvoiceService` becomes `HarborInvoiceService`). The engine suggests the words (from the folder, `package.json` and the git remote); you confirm them.
4. **Architecture**: modules, imports between them, layers (controller, service, repository, ...), external dependencies and engineering patterns (retry, idempotency, events, queues, caching, transactions, auth, validation, tests, ...), from the anonymized text.
5. **Re-check**: the output is scanned again. A unit with a secret, personal data or a project word left in it cannot be approved.
6. **Similarity**: how much original text stayed (token shingles, Jaccard per file). Anonymization keeps structure, so this is high by design; it is a measurement, not a legal statement.
7. **Package**: the Training Unit (below).
8. **Review**: on the page, signed with your name and your statement that you own the code or may license it.
9. **Export**: the unit, a `dataset.jsonl` (one line per file) and `MANIFEST.sha256`, to `<app data>/sde/exports/<run>/`.

## The Training Unit

```
metadata.json  task.md  context.md  architecture.json  inventory.json
synthetic/repository/        the anonymized code
privacy-report.json          what was removed (counts) and what is left
security-report.json         risky code spots
similarity-report.json       how much original text stayed
quality-score.json           automatic signals (tests, patterns, modularity, clean output)
provenance.json              source hash, steps, sourceExecuted: false, network: false
license.json                 detected licences, cleared for commercial use only on approval
review.json  consent.json    your decision and your rights statement
```

The run's `private/` folder holds the source path, the project words and the original-to-replacement mapping. It is never packaged or exported.

## Use it

```bash
npm create acrylblends@latest my-sde -- --from acryl.sde
cd my-sde && npm run dev          # the workbench; open /app/sde
npm start                         # the engine's pages alone, at /sde
npm run sde -- suggest /path/to/project
npm run sde -- scan /path/to/project --term Acme --term Contoso
npm run sde -- list
```

Or run it straight from this repository, <https://github.com/acrylblends/05-acryl-sde>:

```bash
git clone https://github.com/acrylblends/05-acryl-sde.git
cd 05-acryl-sde && npm install && npm run dev
```

Approving and exporting are only on the page, by a person.

## Next (from the plan)

- Synthetic generation: re-implement the extracted architecture in another domain or language with a model, so the output is new code, not rewritten code; validate it builds and its tests pass in a sandbox.
- Syntax-tree parsing (Tree-sitter) instead of import patterns; embedding similarity.
- Coding-agent session traces as a second source (the ACRYL IDE records them).
- Delivery to prepared infrastructure (a dataset store per buyer), always behind the same approval.

MIT licence.
