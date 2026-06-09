import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AutomationBuilder } from "../automation-builder";

export default async function NewAutomationPage() {
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
    redirect("/automations");
  }

  const [{ data: channels }, { data: members }, { data: sequences }] = await Promise.all([
    supabase
      .from("channels")
      .select("id, name, type")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("org_id", profile.org_id)
      .is("deleted_at", null),
    supabase
      .from("sequences")
      .select("id, name")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/automations"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back to automations
        </Link>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">New automation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a trigger, then add the steps that should fire.
          </p>
        </header>
        <AutomationBuilder
          mode="create"
          channels={(channels ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type }))}
          members={(members ?? []).map((m) => ({
            id: m.id,
            name: m.full_name ?? "Agent",
          }))}
          sequences={sequences ?? []}
        />
      </div>
    </div>
  );
}
