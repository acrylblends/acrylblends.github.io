# Upstream audit: Qadam Flow

- Upstream: https://github.com/aiqadam/qadam-flow, commit `51bb340b9b9aa3117ec37c00386fd3478cea2aef` (2026-11-13), MIT.
  Qadam Flow is a derivative of Activepieces (MIT); its `packages/ee` enterprise code was removed upstream and none is used here.
- Notice: `NOTICE` carries Qadam Flow's license text with both copyright lines.

## Used as npm packages, unchanged

| Package | Version | What for |
|---|---|---|
| `@aiqadam/shared` | 0.155.0 | the flow format, `flowOperations.apply` and its zod request schema, `flowStructureUtil`, branch operators, the formula evaluator |
| `@aiqadam/qadams-framework` | 0.35.0 | the action/trigger/property model the integrations are written in |
| `@aiqadam/qadams-common` | 0.17.0 | helpers the integrations use |
| `@aiqadam/qadam-http`, `-schedule`, `-webhook`, `-manual-trigger`, `-data-mapper`, `-delay`, `-math-helper`, `-date-helper`, `-json` | as in package-lock.json | the integrations (actions and triggers) |

## Ported source

Every ported file says so in its first lines, with the upstream path.

| File here | Upstream | How |
|---|---|---|
| `plugins/automation-studio/client/src/canvas/consts.ts` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/edges/loop-return-edge.tsx` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/edges/loop-start-edge.tsx` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/edges/router-end-edge.tsx` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/edges/router-start-edge.tsx` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/edges/straight-line-edge.tsx` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/edges/use-edge-layout-space.ts` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/flow-canvas-utils.ts` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/layout-consts.ts` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/svg-path-utils.ts` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation-studio/client/src/canvas/types.ts` | packages/web/src/app/builder/flow-canvas | adapted |
| `plugins/automation/engine/conditions.ts` | packages/server/engine/src/lib/handler/router-executor.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/array-zipper.ts` | packages/server/engine/src/lib/variables/processors/array-zipper.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/date-time.ts` | packages/server/engine/src/lib/variables/processors/date-time.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/file.ts` | packages/server/engine/src/lib/variables/processors/file.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/index.ts` | packages/server/engine/src/lib/variables/processors/index.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/json.ts` | packages/server/engine/src/lib/variables/processors/json.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/number.ts` | packages/server/engine/src/lib/variables/processors/number.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/object.ts` | packages/server/engine/src/lib/variables/processors/object.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/property-processing-error.ts` | packages/server/engine/src/lib/variables/processors/property-processing-error.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/text.ts` | packages/server/engine/src/lib/variables/processors/text.ts | verbatim (imports fixed) |
| `plugins/automation/engine/processors/types.ts` | packages/server/engine/src/lib/variables/processors/types.ts | verbatim (imports fixed) |
| `plugins/automation/engine/props-processor.ts` | packages/server/engine/src/lib/variables/props-processor.ts | verbatim (imports fixed) |
| `plugins/automation/engine/resolve.ts` | packages/server/engine/src/lib/variables/props-resolver.ts | verbatim (imports fixed) |

## Written here (not ported)

- The engine's run loop (`plugins/automation/engine/executor.ts`): Qadam's engine is not on npm and is bound to its server
  (worker socket, remote file and store APIs, API tokens); the executor runs the same flow format in process, with
  retries, continue-on-failure, routers, loops, delays as durable waitpoints, and no code steps.
- Expressions (`engine/resolve.ts`): a path evaluator plus Qadam's formula evaluator, instead of Qadam's JS sandbox (no `eval`).
- The domain service, stores, encrypted connections, scheduler, HTTP API, agent tools, and the screen around the canvas.

## Not taken

- Code steps (arbitrary JS), the sandbox, piece installation at run time, multi-tenant server, auth, billing, `packages/ee`.
