import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DocShell, DocSection, Code } from "../../api/doc-shell";

export default async function MakeDocsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DocShell title="Make.com connector" intro="Setup, modules, gotchas.">
      <Link href="/integrations" className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
        <ArrowLeft className="size-3" />
        Back to integrations
      </Link>

      <DocSection title="Add the connector">
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>In Make, click <strong>Create scenario</strong> → search apps for <strong>Xyra Chat</strong>.</li>
          <li>The first module you add prompts you to <strong>Add a connection</strong> → paste an API key from{" "}
            <Link href="/settings/api" className="underline">Settings → API & Webhooks</Link>.</li>
          <li>Make calls <code>GET /api/v1/me</code> to verify. Green tick = ready.</li>
        </ol>
        <p className="text-xs text-white/50">
          The connector ships verified by Make — no manual app install required. If you don&apos;t see Xyra Chat in search, the verification is still pending; ping{" "}
          <a href="mailto:hello@xyrachat.com" className="underline">hello@xyrachat.com</a>{" "}
          for early access.
        </p>
      </DocSection>

      <DocSection title="Modules">
        <h3 className="mt-2 text-sm font-medium text-white">Triggers (instant via REST Hook)</h3>
        <ul className="ml-5 list-disc text-sm">
          <li><strong>New inbound message</strong> — fires on every contact message, any channel</li>
          <li><strong>New conversation opened</strong> — first message per contact per channel</li>
          <li><strong>Bot handoff requested</strong> — bot escalates to human</li>
          <li><strong>New contact created</strong> — any source</li>
        </ul>
        <h3 className="mt-3 text-sm font-medium text-white">Actions</h3>
        <ul className="ml-5 list-disc text-sm">
          <li>Send a message (text / template / image)</li>
          <li>Create or update contact (upsert by handle)</li>
          <li>Add tag to contact</li>
          <li>Close conversation</li>
          <li>Assign conversation</li>
          <li>Run automation</li>
        </ul>
        <h3 className="mt-3 text-sm font-medium text-white">Searches</h3>
        <ul className="ml-5 list-disc text-sm">
          <li>Find contact by phone or email</li>
        </ul>
      </DocSection>

      <DocSection title="Trigger lifecycle">
        <p>
          Make&apos;s instant triggers are managed end-to-end:
        </p>
        <ul className="ml-5 list-disc text-sm">
          <li>When you turn the scenario <strong>on</strong>, Make calls{" "}
            <code>POST /api/v1/webhooks/subscribe</code> with <code>X-Xyra-Source: make</code>. Xyra
            creates a webhook endpoint pointing at Make&apos;s URL with the right
            event filter and returns the signing secret.</li>
          <li>When you turn it <strong>off</strong>, Make calls <code>DELETE /api/v1/webhooks/&lt;id&gt;</code>. Xyra cleans up.</li>
          <li>You can see the resulting endpoints in{" "}
            <Link href="/settings/api" className="underline">Settings → API & Webhooks</Link>{" "}
            tagged <code>source: make</code>.</li>
        </ul>
      </DocSection>

      <DocSection title="Test connection">
        <Code language="bash">{`curl -H "Authorization: Bearer $YOUR_KEY" \\
  https://app.xyrachat.com/api/v1/me`}</Code>
      </DocSection>

      <DocSection title="Try the recipes">
        <p>
          <Link href="/docs/integrations/cookbook" className="underline">
            6 ready-to-clone recipes
          </Link>{" "}
          — pricing alerts, lead capture, Stripe receipts, Calendly bookings, Slack handoffs, Notion logging.
        </p>
        <p className="mt-2 inline-flex items-center gap-1">
          <a
            href="https://www.make.com/en/integrations/xyra-chat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
          >
            Open Xyra Chat in Make.com
          </a>
          <ExternalLink className="size-3 text-white/50" />
        </p>
      </DocSection>
    </DocShell>
  );
}
