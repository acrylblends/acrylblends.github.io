import { Check, Copy } from "lucide-react";
import { useRef, useState, type HTMLAttributes } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { resolveLink } from "../lib/framework-docs";

/** A code block with a copy button: the exact text of the block, and "Copied" for a moment. */
function DocsPre({ node, children, ...props }: HTMLAttributes<HTMLPreElement> & { node?: unknown }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const flash = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  const copy = async () => {
    const text = ref.current?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // The clipboard is refused (an insecure context, or a browser setting): select the block and copy that.
      const range = document.createRange();
      if (ref.current) range.selectNodeContents(ref.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("copy");
    }
    flash();
  };
  return <div className="md-code">
    <button type="button" className="md-code-copy" aria-label="Copy this code" onClick={copy}>
      {copied ? <><Check size={12}/> Copied</> : <><Copy size={12}/> Copy</>}
    </button>
    <pre ref={ref} {...props}>{children}</pre>
  </div>;
}

/** One page of markdown, with links between pages resolved to site routes and code highlighted. */
export function Markdown({ pageKey, children }: { pageKey: string; children: string }) {
  return <div className="md-doc"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]} components={{
    pre: (props) => <DocsPre {...props} />,
    a({ href = "", children: label }) {
      const target = resolveLink(pageKey, href);
      if (target.external) return <a href={target.href} target="_blank" rel="noreferrer">{label}</a>;
      if (target.href.startsWith("#")) return <a href={target.href}>{label}</a>;
      return <Link to={target.href}>{label}</Link>;
    },
  }}>{children}</ReactMarkdown></div>;
}
