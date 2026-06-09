import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { SequenceRow } from "@/lib/automations/sequences";
import { SequencesManager } from "./sequences-manager";

export default async function SequencesPage() {
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
  const canManage = ["owner", "admin", "supervisor"].includes(profile.role);

  const { data } = await supabase
    .from("sequences")
    .select("id, name, steps, active, created_at, updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/automations"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white"
        >
          <ArrowLeft className="size-3.5" /> Automations
        </Link>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Sequences</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable drip flows — a series of timed messages. Enroll a contact
            from any automation with the <em>Add to sequence</em> action.
          </p>
        </header>
        <SequencesManager
          initial={(data as SequenceRow[] | null) ?? []}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
