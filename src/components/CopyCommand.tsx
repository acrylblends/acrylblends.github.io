import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

/** One command on one line with a copy button, for the install box. */
export function CopyCommand({ command, label }: { readonly command: string; readonly label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className="copy-command">
      <code title={command}><span>$</span>{command}</code>
      <button type="button" onClick={() => void copy()} aria-label={label}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}
