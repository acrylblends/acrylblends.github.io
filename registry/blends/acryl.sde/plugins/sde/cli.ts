/**
 * The engine from a terminal, for a person or an agent working in this folder: `npm run sde -- <command>`.
 *
 *   suggest <folder>                                 the words that likely name the project (to confirm, then pass with --term)
 *   scan <folder> [--term WORD]... [--label TEXT]    scan, anonymize, check and package one codebase; the run waits for review
 *   list                                             the runs and their status
 *   show <run>                                       one run's counts and what blocks its approval
 *
 * Approving and exporting are not here on purpose: a person does them on the review page (`/sde`, or `/app/sde` in the workbench).
 */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { selectInstance } from '../instance/index.ts'
import { Sde, SdeError } from './src/engine.ts'

const chosen = selectInstance({ projectRoot: fileURLToPath(new URL('../..', import.meta.url)), env: process.env })
const sde = new Sde({ home: join(chosen.home, 'sde') })
const [command, ...rest] = process.argv.slice(2)

function option(name: string): string[] {
  const values: string[] = []
  for (let i = 0; i < rest.length; i += 1) if (rest[i] === name && rest[i + 1] !== undefined) values.push(rest[i + 1] as string)
  return values
}
const positional = rest.filter((value, index) => !value.startsWith('--') && !rest[index - 1]?.startsWith('--'))

try {
  if (command === 'suggest' && positional[0]) {
    console.log(sde.suggestTerms(positional[0]).join('\n'))
  } else if (command === 'scan' && positional[0]) {
    const run = sde.scan({ path: positional[0], terms: option('--term'), label: option('--label')[0] })
    console.log(`run ${run.id}: ${String(run.totals.readFiles)} files read, ${String(run.found.total)} private items found, ${String(run.residual.total)} left in the output`)
    console.log(run.blockers.length > 0 ? `approval blocked: ${run.blockers.join('; ')}` : 'ready for review on the /sde page')
  } else if (command === 'list') {
    for (const run of sde.list()) console.log(`${run.id}  ${run.status.padEnd(8)}  ${run.label}`)
  } else if (command === 'show' && positional[0]) {
    console.log(JSON.stringify(sde.get(positional[0]), null, 2))
  } else {
    console.log('usage: npm run sde -- suggest <folder> | scan <folder> [--term WORD]... [--label TEXT] | list | show <run>')
    process.exitCode = command === undefined ? 0 : 2
  }
} catch (error) {
  if (!(error instanceof SdeError)) throw error
  console.error(error.message)
  process.exitCode = 1
}
