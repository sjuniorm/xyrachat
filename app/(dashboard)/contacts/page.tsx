import { createClient } from "@/lib/supabase/server";
import { ContactsTable, type ContactRow } from "@/components/contacts/contacts-table";

export const metadata = { title: "Contacts — Xyra Chat" };

type RawContact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  instagram_id: string | null;
  telegram_id: string | null;
  tags: string[] | null;
  created_at: string;
};

type RawConv = {
  id: string;
  contact_id: string;
  last_message_at: string;
  channel: { type: string } | null;
};

export default async function ContactsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware handles the redirect

  // RLS scopes both queries to the caller's active org.
  const { data: contactRows } = await supabase
    .from("contacts")
    .select("id, name, phone, email, instagram_id, telegram_id, tags, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  const contacts = (contactRows as RawContact[] | null) ?? [];

  // Latest conversation per contact → drives the "open" link + channel icon.
  const convByContact: Record<
    string,
    { id: string; type: string | null; last_message_at: string }
  > = {};
  if (contacts.length > 0) {
    const { data: convs } = await supabase
      .from("conversations")
      .select(
        "id, contact_id, last_message_at, channel:channels!conversations_channel_id_fkey(type)",
      )
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false })
      .limit(5000);
    for (const c of (convs as RawConv[] | null) ?? []) {
      if (!convByContact[c.contact_id]) {
        convByContact[c.contact_id] = {
          id: c.id,
          type: c.channel?.type ?? null,
          last_message_at: c.last_message_at,
        };
      }
    }
  }

  const rows: ContactRow[] = contacts.map((c) => {
    const conv = convByContact[c.id];
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      instagram_id: c.instagram_id,
      telegram_id: c.telegram_id,
      tags: c.tags ?? [],
      created_at: c.created_at,
      conversationId: conv?.id ?? null,
      channelType: conv?.type ?? null,
      lastActivity: conv?.last_message_at ?? null,
    };
  });

  return <ContactsTable contacts={rows} />;
}
