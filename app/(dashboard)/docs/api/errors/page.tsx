import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DocShell, DocSection, Code } from "../doc-shell";

export default async function ErrorsDocsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DocShell title="Errors" intro="Canonical error shape + status codes.">
      <Link href="/docs/api" className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
        <ArrowLeft className="size-3" />
        Back to docs
      </Link>

      <DocSection title="Shape">
        <p>Every non-2xx response uses this JSON body:</p>
        <Code language="json">{`{
  "error": {
    "type": "invalid_request",
    "code": "missing_field",
    "message": "phone is required.",
    "param": "phone"
  }
}`}</Code>
        <ul className="ml-5 list-disc">
          <li><code>type</code> — high-level category (matches HTTP status family)</li>
          <li><code>code</code> — machine-readable identifier you can switch on</li>
          <li><code>message</code> — human-readable, safe to display</li>
          <li><code>param</code> — for validation errors, the offending field</li>
        </ul>
      </DocSection>

      <DocSection title="Status codes">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/10 text-white/60">
            <tr>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2">Meaning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <tr><td className="py-1.5 pr-3 font-mono">400</td><td className="py-1.5 pr-3 font-mono">invalid_request</td><td className="py-1.5">Bad JSON, missing field, invalid cursor.</td></tr>
            <tr><td className="py-1.5 pr-3 font-mono">401</td><td className="py-1.5 pr-3 font-mono">unauthorized</td><td className="py-1.5">Missing / bad / revoked / expired API key.</td></tr>
            <tr><td className="py-1.5 pr-3 font-mono">403</td><td className="py-1.5 pr-3 font-mono">forbidden</td><td className="py-1.5">Insufficient scope, plan limit, or org mismatch.</td></tr>
            <tr><td className="py-1.5 pr-3 font-mono">404</td><td className="py-1.5 pr-3 font-mono">not_found</td><td className="py-1.5">Resource doesn&apos;t exist or isn&apos;t in your org.</td></tr>
            <tr><td className="py-1.5 pr-3 font-mono">409</td><td className="py-1.5 pr-3 font-mono">conflict</td><td className="py-1.5">Idempotency replay with a different body.</td></tr>
            <tr><td className="py-1.5 pr-3 font-mono">422</td><td className="py-1.5 pr-3 font-mono">unprocessable</td><td className="py-1.5">Semantic error: WA 24h window closed, template not approved, contact opted out, etc.</td></tr>
            <tr><td className="py-1.5 pr-3 font-mono">429</td><td className="py-1.5 pr-3 font-mono">rate_limited</td><td className="py-1.5">Honor the <code>Retry-After</code> header.</td></tr>
            <tr><td className="py-1.5 pr-3 font-mono">500</td><td className="py-1.5 pr-3 font-mono">internal</td><td className="py-1.5">Our bug — retry with backoff. Email support if it persists.</td></tr>
          </tbody>
        </table>
      </DocSection>

      <DocSection title="Common codes you should handle">
        <ul className="ml-5 list-disc">
          <li><code>wa_window_closed</code> — switch to <code>type=&quot;template&quot;</code></li>
          <li><code>contact_opted_out</code> — never message until they reply <code>START</code></li>
          <li><code>template_not_approved</code> — sync templates and retry</li>
          <li><code>insufficient_scope</code> — generate a new key with the right scope</li>
          <li><code>rate_limited</code> — back off + retry</li>
        </ul>
      </DocSection>
    </DocShell>
  );
}
