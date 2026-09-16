import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">{children}</div>;
}
export function SectionTitle({ eyebrow, title, intro }: { eyebrow?: string; title: string; intro?: string }) {
  return <div className="max-w-3xl"><>{eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}</><h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-foreground md:text-5xl">{title}</h2>{intro && <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">{intro}</p>}</div>;
}
export function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="overflow-hidden rounded-md border border-code-border bg-code text-code-foreground shadow-code"><div className="flex h-11 items-center justify-between border-b border-code-border px-4"><span className="font-mono text-xs text-code-muted">{label}</span><button aria-label={`Copy ${label}`} className="icon-button text-code-muted hover:text-code-foreground" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={15}/> : <Copy size={15}/>}</button></div><pre className="overflow-x-auto p-5 text-sm leading-7"><code>{code}</code></pre></div>;
}
export function Status({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warning" | "success" }) {
 return <span className={`inline-flex rounded-sm border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${tone === "warning" ? "border-warning/30 bg-warning/10 text-warning" : tone === "success" ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"}`}>{children}</span>
}
export function TriangleMark({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`triangle-mark ${className}`}><span/><span/><span/></div>;
}
