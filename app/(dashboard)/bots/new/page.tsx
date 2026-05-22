import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewBotWizard } from "./new-bot-wizard";

export default async function NewBotPage() {
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

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create a bot
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a goal, set a personality, and feed it some knowledge.
            You can add more knowledge + assign channels after creation.
          </p>
        </header>
        <NewBotWizard />
      </div>
    </div>
  );
}
