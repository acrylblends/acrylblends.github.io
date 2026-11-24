import { useState } from 'react'
import { CopyCommand } from './CopyCommand'

/** The one-line install of ACRYL Control Center, for the visitor's OS first; a tab switches. */
const installs = {
  unix: { tab: 'macOS / Linux', command: 'curl -fsSL https://acryl.dev/install.sh | bash' },
  windows: { tab: 'Windows', command: 'irm https://acryl.dev/install.ps1 | iex' },
} as const
type Os = keyof typeof installs

const visitorOs = (): Os => (typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent) && !/darwin|mac/i.test(navigator.userAgent) ? 'windows' : 'unix')

export function InstallBox() {
  const [os, setOs] = useState<Os>(visitorOs)
  return (
    <div className="install-box mt-8 max-w-xl border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Install ACRYL Control Center</p>
      <div className="film-switch mt-3" role="tablist" aria-label="Choose your system">
        {(Object.keys(installs) as Os[]).map(key => (
          <button key={key} type="button" role="tab" aria-selected={key === os} className={key === os ? 'active' : undefined} onClick={() => setOs(key)}>{installs[key].tab}</button>
        ))}
      </div>
      <CopyCommand command={installs[os].command} label={`Copy the ${installs[os].tab} install command`} />
      <p className="mt-3 text-xs leading-5 text-muted-foreground">No Node and no admin for the app itself (Linux asks for sudo once if git or a desktop library is missing). The download is checked against GitHub&apos;s sha256; Windows and macOS open it without warnings because it is not browser-downloaded.</p>
    </div>
  )
}
