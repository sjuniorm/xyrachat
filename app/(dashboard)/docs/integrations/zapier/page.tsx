import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DocShell, DocSection, Code } from "../../api/doc-shell";

export default async function ZapierDocsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DocShell title="Zapier app" intro="Setup, triggers + creates + searches, walk-through.">
      <Link href="/integrations" className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
        <ArrowLeft className="size-3" />
        Back to integrations
      </Link>

      <DocSection title="Connect to Zapier">
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>In Zapier, search apps for <strong>Xyra Chat</strong>.</li>
          <li>Pick a trigger or action — Zapier prompts to add a connection.</li>
          <li>Paste an API key from{" "}
            <Link href="/settings/api" className="underline">Settings → API & Webhooks</Link>. Zapier validates with <code>GET /api/v1/me</code>.</li>
        </ol>
      </DocSection>

      <DocSection title="Triggers (instant via REST Hook)">
        <ul className="ml-5 list-disc text-sm">
          <li><strong>New inbound message</strong> — every contact DM, any channel</li>
          <li><strong>New conversation opened</strong></li>
          <li><strong>Bot handoff requested</strong></li>
          <li><strong>New contact created</strong></li>
        </ul>
      </DocSection>

      <DocSection title="Creates (actions)">
        <ul className="ml-5 list-disc text-sm">
          <li>Send a message (text / template / image)</li>
          <li>Create or update contact</li>
          <li>Add tag to contact</li>
          <li>Close conversation</li>
          <li>Assign conversation</li>
          <li>Run automation</li>
        </ul>
      </DocSection>

      <DocSection title="Searches">
        <ul className="ml-5 list-disc text-sm">
          <li>Find contact by phone or email</li>
        </ul>
      </DocSection>

      <DocSection title="Test connection">
        <Code language="bash">{`curl -H "Authorization: Bearer $YOUR_KEY" \\
  https://app.xyrachat.com/api/v1/me`}</Code>
      </DocSection>

      <DocSection title="Recipes + app page">
        <p>
          <Link href="/docs/integrations/cookbook" className="underline">
            6 ready-to-clone Zapier recipes
          </Link>
          .
        </p>
        <p className="mt-2 inline-flex items-center gap-1">
          <a
            href="https://zapier.com/apps/xyra-chat/integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
          >
            Open Xyra Chat in Zapier
          </a>
          <ExternalLink className="size-3 text-white/50" />
        </p>
      </DocSection>
    </DocShell>
  );
}
