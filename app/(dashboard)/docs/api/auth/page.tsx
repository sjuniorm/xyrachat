import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DocShell, DocSection, Code } from "../doc-shell";
import { SCOPES } from "@/lib/api/scopes";

export default async function AuthDocsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DocShell title="Auth + scopes" intro="Bearer tokens, scope reference, plan tiers.">
      <Link href="/docs/api" className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
        <ArrowLeft className="size-3" />
        Back to docs
      </Link>

      <DocSection title="Bearer token">
        <p>
          Every request needs the <code>Authorization</code> header:
        </p>
        <Code>{`Authorization: Bearer xyra_live_<token>`}</Code>
        <p>
          Keys are SHA-256 hashed with a server-side pepper, so even a database
          dump can&apos;t reveal active credentials. Constant-time comparison on
          lookup prevents timing attacks.
        </p>
      </DocSection>

      <DocSection title="Scopes">
        <p>
          Every key carries a list of scopes. Endpoints fail with{" "}
          <code>403 forbidden / insufficient_scope</code> if the key lacks the
          required scope.
        </p>
        <ul className="ml-5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-white/80">
          {SCOPES.map((s) => (
            <li key={s} className="font-mono">{s}</li>
          ))}
        </ul>
        <p className="mt-3">
          <code>admin</code> is a meta-scope that grants everything — use sparingly.
        </p>
      </DocSection>

      <DocSection title="Plan tiers">
        <p>
          Public API access is a paid feature. Free plans can&apos;t generate
          keys; Starter generates read-only keys; Pro+ can generate keys with
          write scopes.
        </p>
        <ul className="ml-5 list-disc">
          <li><strong>Free</strong> — no API access</li>
          <li><strong>Starter</strong> — read-only, 100 req/min</li>
          <li><strong>Pro</strong> — full read+write, 600 req/min, 100k webhook deliveries/month</li>
          <li><strong>Scale</strong> — full, 3 000 req/min, 1M deliveries/month</li>
          <li><strong>Custom</strong> — bespoke limits</li>
        </ul>
      </DocSection>

      <DocSection title="Rate limits">
        <p>
          Every response carries <code>X-RateLimit-Limit</code>,{" "}
          <code>X-RateLimit-Remaining</code>, and <code>X-RateLimit-Reset</code>{" "}
          (Unix seconds). Over-limit responses are{" "}
          <code>429 rate_limited</code> with a <code>Retry-After</code> header.
        </p>
      </DocSection>
    </DocShell>
  );
}
