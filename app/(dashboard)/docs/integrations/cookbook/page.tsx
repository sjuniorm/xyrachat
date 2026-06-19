import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DocShell, DocSection, Code } from "../../api/doc-shell";

export default async function CookbookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <DocShell
      title="Integration cookbook"
      intro="Six ready-to-clone recipes. Click through to Make / Zapier / n8n to wire them up."
    >
      <Link
        href="/integrations"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"
      >
        <ArrowLeft className="size-3" />
        Back to integrations
      </Link>

      <Recipe
        id="wa-lead-hubspot"
        title="WhatsApp lead → HubSpot contact"
        platforms={["Make", "Zapier"]}
      >
        <p>
          When the bot captures a lead from a WhatsApp chat, push it into
          HubSpot as a new contact + deal.
        </p>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Create a bot with objective <code>lead_generation</code> and assign it to a WA channel.</li>
          <li>In Make / Zapier, add a Xyra trigger: <em>Bot lead captured</em>.</li>
          <li>Add HubSpot <em>Create or update contact</em> as the next step. Map:
            <ul className="ml-5 mt-1 list-disc text-xs text-white/70">
              <li><code>email</code> ← <code>data.fields.email</code></li>
              <li><code>phone</code> ← <code>data.contact.phone</code></li>
              <li><code>firstname</code> ← <code>data.contact.name</code></li>
            </ul>
          </li>
        </ol>
      </Recipe>

      <Recipe
        id="handoff-slack"
        title="Bot handoff → Slack alert"
        platforms={["Make", "Zapier", "n8n"]}
      >
        <p>
          Ping <code>#support</code> the moment a bot escalates to a human so
          the on-call agent can jump in fast.
        </p>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Trigger: Xyra <em>Bot handoff</em>.</li>
          <li>Action: Slack <em>Send channel message</em>.</li>
          <li>Message body suggestion:</li>
        </ol>
        <Code>{`🔔 Bot handed off — reason: {{data.reason}}
Open in Xyra: https://app.xyrachat.com/inbox/{{data.conversation_id}}`}</Code>
      </Recipe>

      <Recipe
        id="new-convo-notion"
        title="New conversation → Notion row"
        platforms={["Make", "Zapier"]}
      >
        <p>
          Log every new conversation to a Notion database so non-Xyra teams
          (sales, ops) can see what's coming in.
        </p>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Trigger: Xyra <em>New conversation opened</em>.</li>
          <li>Notion <em>Create database item</em>. Map contact name +
            channel + created_at to your DB columns.</li>
        </ol>
      </Recipe>

      <Recipe
        id="closed-convo-sheets"
        title="Closed conversation → Google Sheets"
        platforms={["Make", "Zapier", "n8n"]}
      >
        <p>
          Append a row to a tracking sheet whenever an agent closes a chat.
          Cheap analytics + audit log.
        </p>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Trigger: Xyra <em>Conversation closed</em>.</li>
          <li>Google Sheets <em>Add row</em>. Columns: conversation_id,
            channel, closed_at, assigned_to.</li>
        </ol>
      </Recipe>

      <Recipe
        id="stripe-receipt"
        title="Stripe payment → WhatsApp receipt"
        platforms={["Make", "Zapier"]}
      >
        <p>
          Send a thank-you / receipt template right after a Stripe charge
          succeeds. Customers love this; conversion-rate boost on follow-ups
          ranges 8-15% in our beta.
        </p>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Trigger: Stripe <em>New charge</em> (built-in).</li>
          <li>Xyra <em>Find contact</em> by Stripe customer email/phone.</li>
          <li>Xyra <em>Send message</em>: <code>type=template</code>,
            template name <code>payment_receipt</code>. Map <code>{"{{1}}"}</code> to
            <code>customer.name</code>, <code>{"{{2}}"}</code> to charge amount.</li>
        </ol>
      </Recipe>

      <Recipe
        id="calendly-booking"
        title="Calendly booking → Xyra contact + tag"
        platforms={["Make", "Zapier"]}
      >
        <p>
          Create a contact and tag them <code>booked</code> as soon as
          they grab a slot — so your sales bot stops re-pitching.
        </p>
        <ol className="ml-5 list-decimal space-y-1 text-sm">
          <li>Trigger: Calendly <em>Invitee created</em>.</li>
          <li>Xyra <em>Create or update contact</em>. Map name + email + phone.</li>
          <li>Xyra <em>Add tag to contact</em>: tag = <code>booked</code>.</li>
        </ol>
      </Recipe>

      <DocSection title="Build your own">
        <p className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-[color:var(--xyra-glow)]" />
          Don&apos;t see your stack? Every recipe above is just a sequence of API
          calls — the <Link href="/docs/api" className="underline">REST reference</Link>{" "}
          + <Link href="/docs/api/webhooks" className="underline">webhook docs</Link>{" "}
          cover everything you need to roll your own.
        </p>
      </DocSection>
    </DocShell>
  );
}

function Recipe({
  id,
  title,
  platforms,
  children,
}: {
  id: string;
  title: string;
  platforms: string[];
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-1 text-base font-medium text-white">
        {title}
      </h2>
      <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">
        Available on: {platforms.join(" · ")}
      </p>
      <div className="space-y-3 text-sm text-white/70 mb-8">{children}</div>
    </section>
  );
}
