import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DocShell, DocSection, Code } from "../doc-shell";

export default async function IdempotencyDocsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DocShell title="Idempotency" intro="Safe retries for mutating POSTs.">
      <Link href="/docs/api" className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
        <ArrowLeft className="size-3" />
        Back to docs
      </Link>

      <DocSection title="The problem">
        <p>
          Network blips cause clients to retry POST requests. Without an
          idempotency mechanism, you&apos;d send the same WhatsApp message
          twice, charge the same broadcast twice, etc.
        </p>
      </DocSection>

      <DocSection title="Idempotency-Key header">
        <p>
          Generate a UUID (or any unique string up to 64 chars) per logical
          operation and send it as:
        </p>
        <Code>{`Idempotency-Key: <uuid>`}</Code>
        <p>
          The server caches the response under <code>{`{api_key_id}:{your_key}`}</code>{" "}
          for 24 hours. Repeats within that window return the cached response
          without re-executing the action.
        </p>
      </DocSection>

      <DocSection title="Example">
        <Code language="bash">{`# First call — sends the message and caches the response.
curl -X POST https://xyra-chat.vercel.app/api/v1/messages \\
  -H "Authorization: Bearer $KEY" \\
  -H "Idempotency-Key: 4c1f8a4e-7c12-4d6f-9c91-a4b5e8e8b3a1" \\
  -H "Content-Type: application/json" \\
  -d '{"conversation_id":"conv_...","content":"Hi!"}'

# Retry within 24h — returns the cached response, doesn't re-send.
curl -X POST https://xyra-chat.vercel.app/api/v1/messages \\
  -H "Authorization: Bearer $KEY" \\
  -H "Idempotency-Key: 4c1f8a4e-7c12-4d6f-9c91-a4b5e8e8b3a1" \\
  -H "Content-Type: application/json" \\
  -d '{"conversation_id":"conv_...","content":"Hi!"}'`}</Code>
      </DocSection>

      <DocSection title="Which endpoints support it">
        <p>Currently honored on:</p>
        <ul className="ml-5 list-disc">
          <li><code>POST /api/v1/contacts</code></li>
          <li><code>POST /api/v1/messages</code></li>
          <li><code>POST /api/v1/broadcasts</code></li>
        </ul>
        <p className="mt-2">
          Other POSTs (close, assign, transfer_to_bot, handoff, automation run)
          are inherently idempotent on Xyra&apos;s side — re-running them
          converges to the same state.
        </p>
      </DocSection>
    </DocShell>
  );
}
