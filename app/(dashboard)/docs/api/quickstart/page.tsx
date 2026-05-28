import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DocShell, DocSection, Code } from "../doc-shell";

export default async function QuickstartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DocShell title="Quickstart" intro="Make your first API call in under a minute.">
      <Link href="/docs/api" className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
        <ArrowLeft className="size-3" />
        Back to docs
      </Link>

      <DocSection n={1} title="Generate an API key">
        <p>
          Open <Link href="/settings/api" className="underline">Settings → API & Webhooks</Link>,
          click <span className="text-white">New key</span>, pick the scopes you need (e.g.{" "}
          <code>contacts:read</code> + <code>messages:write</code>), and copy the plaintext key.
          It&apos;s only shown once.
        </p>
      </DocSection>

      <DocSection n={2} title="Verify the key">
        <Code language="bash">{`curl -H "Authorization: Bearer xyra_live_..." \\
  https://xyra-chat.vercel.app/api/v1/me`}</Code>
        <p className="mt-2">
          Returns the key context, the org id, and its scopes:
        </p>
        <Code language="json">{`{
  "object": "api_key",
  "id": "key_...",
  "org_id": "org_...",
  "name": "Make.com production",
  "scopes": ["contacts:read", "messages:write"]
}`}</Code>
      </DocSection>

      <DocSection n={3} title="Send a WhatsApp message">
        <Code language="bash">{`curl -X POST https://xyra-chat.vercel.app/api/v1/messages \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: \$(uuidgen)" \\
  -d '{
    "conversation_id": "conv_...",
    "content": "Hi! Quick update on your order.",
    "type": "text"
  }'`}</Code>
        <p className="mt-2">
          Outside the WhatsApp 24-hour customer-service window? Use{" "}
          <code>type=&quot;template&quot;</code> with a Meta-approved template instead.
        </p>
      </DocSection>

      <DocSection n={4} title="Subscribe to outbound events">
        <p>
          Get a POST to your URL whenever an event fires. <Link href="/docs/api/webhooks" className="underline">See the
          webhook docs</Link> for the full event catalog + HMAC verification code.
        </p>
        <Code language="bash">{`curl -X POST https://xyra-chat.vercel.app/api/v1/webhooks/subscribe \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-server.com/xyra",
    "events": ["message.received", "bot.handoff", "conversation.closed"]
  }'`}</Code>
        <p className="mt-2">
          The response includes a <code>secret</code> — copy it and use it to verify the HMAC on every webhook delivery.
        </p>
      </DocSection>

      <DocSection n={5} title="Next steps">
        <ul className="ml-5 list-disc text-sm">
          <li><Link href="/docs/api/auth" className="underline">Auth + scope reference</Link></li>
          <li><Link href="/docs/api/idempotency" className="underline">Idempotency</Link> — safe retries for mutating POSTs</li>
          <li><Link href="/docs/api/errors" className="underline">Error reference</Link></li>
          <li><Link href="/docs/api/webhooks" className="underline">Webhook signature verification</Link></li>
          <li><Link href="/docs/api" className="underline">Full Swagger reference</Link> with try-it-out</li>
        </ul>
      </DocSection>
    </DocShell>
  );
}
