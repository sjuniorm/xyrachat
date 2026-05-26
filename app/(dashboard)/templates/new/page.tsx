import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TemplateBuilder } from "./template-builder";

export default async function NewTemplatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: channels } = await supabase
    .from("channels")
    .select("id, name, wa_business_account_id")
    .eq("type", "whatsapp")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const usable = (channels ?? []).filter((c) => c.wa_business_account_id);
  if (usable.length === 0) redirect("/templates");

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
          <h1 className="text-2xl font-semibold tracking-tight">New template</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit to Meta for approval. Most templates approve in minutes;
            marketing templates can take up to 24h.
          </p>
        </header>
        <TemplateBuilder
          channels={usable.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>
    </div>
  );
}
