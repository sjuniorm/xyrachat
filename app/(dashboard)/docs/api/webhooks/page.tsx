import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DocShell, DocSection, Code } from "../doc-shell";
import { EVENT_TYPES } from "@/lib/api/events";

export default async function WebhooksDocsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DocShell title="Webhooks + signatures" intro="Outbound events, HMAC verification, retry semantics.">
      <Link href="/docs/api" className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
        <ArrowLeft className="size-3" />
        Back to docs
      </Link>

      <DocSection title="Event catalog">
        <ul className="ml-5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
          {EVENT_TYPES.map((e) => (
            <li key={e} className="font-mono text-white/80">{e}</li>
          ))}
        </ul>
      </DocSection>

      <DocSection title="Subscribing">
        <Code language="bash">{`curl -X POST https://xyra-chat.vercel.app/api/v1/webhooks/subscribe \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-server.com/xyra",
    "events": ["message.received", "bot.handoff"]
  }'`}</Code>
        <p>The response includes the signing <code>secret</code> — store it.</p>
      </DocSection>

      <DocSection title="Payload shape">
        <Code language="json">{`{
  "id": "evt_<uuid>",
  "type": "message.received",
  "created": "2026-05-28T10:34:56.789Z",
  "org_id": "org_...",
  "data": {
    "id": "msg_...",
    "conversation_id": "conv_...",
    "contact_id": "contact_...",
    "channel_id": "ch_...",
    "channel_type": "whatsapp",
    "direction": "inbound",
    "content": "hi!",
    "media_type": null,
    "created_at": "2026-05-28T10:34:56.789Z"
  }
}`}</Code>
      </DocSection>

      <DocSection title="Headers on every delivery">
        <Code>{`X-Xyra-Event:     message.received
X-Xyra-Event-Id:  <uuid>     # consumer dedupes on this
X-Xyra-Timestamp: <unix-ts>  # reject > 5 min old
X-Xyra-Signature: t=<ts>,v1=<hmac>
User-Agent:       XyraChat-Webhook/1.0`}</Code>
        <p>
          The HMAC is <code>HMAC-SHA256(secret, &quot;${"{ts}"}.${"{rawBody}"}&quot;)</code>{" "}
          encoded as hex. Stripe&apos;s scheme, well understood by Make / Zapier / n8n out of the box.
        </p>
      </DocSection>

      <DocSection title="Verifying in Node.js">
        <Code language="javascript">{`import crypto from 'crypto';

function verifyXyraSignature(rawBody, header, secret) {
  const parts = Object.fromEntries(
    header.split(',').map(s => s.split('='))
  );
  const ts = parts.t;
  const provided = parts.v1;
  // Reject anything older than 5 min — replay defense.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${ts}.\${rawBody}\`)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(expected),
  );
}`}</Code>
      </DocSection>

      <DocSection title="Verifying in Python">
        <Code language="python">{`import hmac, hashlib, time

def verify_xyra_signature(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split('=') for p in header.split(','))
    ts = parts['t']
    provided = parts['v1']
    if abs(time.time() - int(ts)) > 300:
        return False
    expected = hmac.new(
        secret.encode(),
        f"{ts}.{raw_body.decode()}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(provided, expected)`}</Code>
      </DocSection>

      <DocSection title="Verifying in Go">
        <Code language="go">{`func VerifyXyraSignature(rawBody []byte, header, secret string) bool {
    parts := map[string]string{}
    for _, p := range strings.Split(header, ",") {
        kv := strings.SplitN(p, "=", 2)
        parts[kv[0]] = kv[1]
    }
    ts, _ := strconv.ParseInt(parts["t"], 10, 64)
    if abs(time.Now().Unix()-ts) > 300 {
        return false
    }
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(parts["t"] + "." + string(rawBody)))
    expected := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(parts["v1"]), []byte(expected))
}`}</Code>
      </DocSection>

      <DocSection title="Retry semantics">
        <ul className="ml-5 list-disc">
          <li>Respond <code>2xx</code> within 10 seconds — we mark it succeeded.</li>
          <li>Respond <code>410 Gone</code> — we permanently deactivate the endpoint and email the org owner.</li>
          <li>Any other <code>4xx</code> — we mark failed, no retry (it&apos;s your bug).</li>
          <li><code>5xx</code> / timeout / network error — we queue a retry. Backoff:{" "}
            <code>30s → 1m → 5m → 30m → 2h → 6h → 12h → 24h</code>. After 8 attempts we mark <code>exhausted</code>.</li>
        </ul>
        <p className="mt-2">
          Replay any historic delivery from the dashboard&apos;s deliveries log.
        </p>
      </DocSection>
    </DocShell>
  );
}
