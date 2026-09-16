import { Link } from "react-router-dom";

export default function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-background px-5"><div className="max-w-lg text-center"><p className="font-mono text-sm text-accent-foreground">404 / LOST LAYER</p><h1 className="mt-4 text-5xl font-semibold">This node isn't in the registry.</h1><p className="mt-4 text-muted-foreground">The page may have moved, or this part of the ecosystem has not been composed yet.</p><Link to="/" className="btn-primary mt-7">Return home</Link></div></div>;
}
