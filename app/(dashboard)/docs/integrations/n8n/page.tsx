import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DocShell, DocSection, Code } from "../../api/doc-shell";

export default async function N8nDocsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DocShell title="n8n community node" intro="Install, use the Xyra Chat node + trigger node.">
      <Link href="/integrations" className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
        <ArrowLeft className="size-3" />
        Back to integrations
      </Link>

      <DocSection title="Install">
        <p>
          The community node is published on npm as{" "}
          <code>@xyrachat/n8n-nodes-xyrachat</code>. Install via the n8n UI:
        </p>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Settings → Community Nodes → <strong>Install</strong></li>
          <li>Package name: <code>@xyrachat/n8n-nodes-xyrachat</code></li>
          <li>Click Install + restart n8n.</li>
        </ol>
        <p className="text-xs text-white/50">
          Self-hosting CLI: <code>npm install @xyrachat/n8n-nodes-xyrachat</code> in your n8n project, then restart.
        </p>
      </DocSection>

      <DocSection title="Add credentials">
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Credentials → New → <strong>Xyra Chat API</strong>.</li>
          <li>Paste an API key from{" "}
            <Link href="/settings/api" className="underline">Settings → API & Webhooks</Link>.</li>
          <li>(Optional) override Base URL for self-hosted Xyra deployments.</li>
        </ol>
      </DocSection>

      <DocSection title="Two nodes">
        <h3 className="mt-2 text-sm font-medium text-white">Xyra Chat (action node)</h3>
        <p>
          Resource/Operation pattern. Resources: Contact, Conversation, Message, Broadcast,
          Automation, Template, Bot, Outcome.
        </p>
        <h3 className="mt-3 text-sm font-medium text-white">Xyra Chat Trigger (REST Hook)</h3>
        <p>
          Pick one event per node. On activation, the workflow auto-subscribes
          a webhook with Xyra and tears it down on deactivation. Events
          tagged <code>source: n8n</code> in the dashboard.
        </p>
      </DocSection>

      <DocSection title="Test connection">
        <Code language="bash">{`curl -H "Authorization: Bearer $YOUR_KEY" \\
  https://xyra-chat.vercel.app/api/v1/me`}</Code>
      </DocSection>

      <DocSection title="Recipes + npm page">
        <p>
          <Link href="/docs/integrations/cookbook" className="underline">6 ready-to-clone recipes</Link>.
        </p>
        <p className="mt-2 inline-flex items-center gap-1">
          <a
            href="https://www.npmjs.com/package/@xyrachat/n8n-nodes-xyrachat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
          >
            Open on npm
          </a>
          <ExternalLink className="size-3 text-white/50" />
        </p>
      </DocSection>
    </DocShell>
  );
}
