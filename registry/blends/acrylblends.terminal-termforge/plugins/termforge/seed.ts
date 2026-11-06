/** What a person sees on the first start: three workspaces; the first has the mockup's session (`pwd`, `git status`), the others start empty. */
import type { Entry, ForgeState, Snippet } from './domain.ts'

const at = (hm: string): string => new Date(`2026-11-05T${hm}:00`).toISOString()
const entry = (id: string, command: Entry['command'], output: string, hm: string): Entry => ({ id, command, output, status: 0, at: at(hm) })

const snippets: Snippet[] = [
  { id: 'snip-ls', label: 'List files', command: 'ls' },
  { id: 'snip-log', label: 'Recent commits', command: 'git log' },
  { id: 'snip-test', label: 'Test suite', command: 'npm test' },
  { id: 'snip-help', label: 'Command help', command: 'help' },
]

export function seed(): ForgeState {
  return {
    version: 1,
    workspaces: [
      {
        id: 'acryl',
        name: 'acryl / local-dev',
        user: 'alex',
        host: 'acryl',
        cwd: '~/projects/acryl',
        profile: 'macOS / ARM64',
        tabs: [{ id: 'tab-1', name: 'zsh', cleared: false, entries: [entry('e-1', 'pwd', '/Users/alex/projects/acryl', '10:41'), entry('e-2', 'git status', 'On branch main\nYour branch is up to date with origin/main.\nnothing to commit, working tree clean', '10:42')] }],
      },
      { id: 'infra-staging', name: 'infra / staging', user: 'alex', host: 'infra', cwd: '~/infra/staging', profile: 'Linux / x86_64', tabs: [{ id: 'tab-2', name: 'zsh', cleared: false, entries: [] }] },
      { id: 'scratch', name: 'scripts / scratch', user: 'alex', host: 'scratch', cwd: '~/scripts', profile: 'macOS / ARM64', tabs: [{ id: 'tab-3', name: 'zsh', cleared: false, entries: [] }] },
    ],
    snippets,
  }
}
