---
name: sde
description: Run ACRYL SDE, the Synthetic Data Engine in this app - scan a codebase, anonymize it and package a Training Unit for review. Use when asked to collect, anonymize or package code as training data.
---

# ACRYL SDE

The engine is the plugin in `plugins/sde`. Drive it from the terminal in this folder:

- `npm run sde -- suggest <absolute folder>`: the words that likely name the project. Show them to the person and ask which to remove; add company, product and customer names they mention.
- `npm run sde -- scan <absolute folder> --term WORD ...`: one run. It prints how many private items were found and whether anything is left that blocks approval. If something is left, ask for the missing words and scan again.
- `npm run sde -- list`, `npm run sde -- show <run>`: the runs.

Rules:

- Never approve or export a unit: the person does that on the review page (`/app/sde` in the workbench, `/sde` with `npm start`). Tell them the run is ready there.
- Never copy, upload or send a codebase, a unit or an export anywhere. Never print a secret the scan found; the reports hold masked previews only.
- Never read `<app data>/sde/runs/<run>/private/` back to the person in chat: it holds the mapping from replacements to original values.
