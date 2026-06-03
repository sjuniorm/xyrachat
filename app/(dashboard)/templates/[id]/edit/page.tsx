import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TemplateBuilder } from "../../new/template-builder";
import type { TemplateCategory, TemplateComponent } from "@/lib/templates/types";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    redirect("/templates");
  }

  const { data: tpl } = await supabase
    .from("wa_templates")
    .select(
      "id, channel_id, name, language, category, components, example_values, meta_status",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!tpl) notFound();

  // Meta refuses edits on templates that are still under review.
  if (tpl.meta_status === "PENDING" || tpl.meta_status === "IN_APPEAL") {
    redirect("/templates");
  }

  const { data: channel } = await supabase
    .from("channels")
    .select("name")
    .eq("id", tpl.channel_id)
    .maybeSingle();
  const channelName = channel?.name ?? "WhatsApp channel";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/templates"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to templates
        </Link>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Edit template</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Editing resubmits to Meta for review. The approved version keeps
            sending until the edit is approved. Name and language can&apos;t
            change — create a new template for those.
          </p>
        </header>
        <TemplateBuilder
          channels={[{ id: tpl.channel_id, name: channelName }]}
          edit={{
            templateId: tpl.id,
            channelId: tpl.channel_id,
            name: tpl.name,
            language: tpl.language,
            category: tpl.category as TemplateCategory,
            components: (tpl.components ?? []) as TemplateComponent[],
            exampleValues: (tpl.example_values ?? {}) as Record<string, string[]>,
          }}
        />
      </div>
    </div>
  );
}
