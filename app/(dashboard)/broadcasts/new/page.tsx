import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BroadcastWizard } from "./broadcast-wizard";

export default async function NewBroadcastPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  if (!["owner", "admin", "supervisor"].includes(profile.role)) {
    redirect("/broadcasts");
  }

  // Channels with approved templates only — anything else is a dead end
  // for the wizard.
  const [{ data: channels }, { data: templates }, { data: tagAgg }] =
    await Promise.all([
      supabase
        .from("channels")
        .select("id, name, type")
        .eq("type", "whatsapp")
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("wa_templates")
        .select("id, name, language, channel_id, components, example_values, category")
        .eq("meta_status", "APPROVED")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("contacts")
        .select("tags")
        .is("deleted_at", null)
        .limit(2000),
    ]);

  // Flatten tags to a unique set for the audience-filter picker. 2k contact
  // limit keeps the query bounded; rare-tag workspaces can still tag-filter
  // by typing exact values once we add free-text input.
  const tagSet = new Set<string>();
  for (const c of tagAgg ?? []) {
    for (const t of c.tags ?? []) tagSet.add(t);
  }
  const tags = Array.from(tagSet).sort();

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/broadcasts"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to broadcasts
        </Link>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">New broadcast</h1>
        </header>
        <BroadcastWizard
          channels={(channels ?? []).map((c) => ({ id: c.id, name: c.name }))}
          templates={(templates ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            language: t.language,
            channel_id: t.channel_id,
            components: t.components,
            example_values: t.example_values,
            category: t.category,
          }))}
          tags={tags}
        />
      </div>
    </div>
  );
}
