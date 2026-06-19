import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SurveySettings } from "./survey-settings";
import { EmailSignatureSettings } from "./email-signature-settings";

export const dynamic = "force-dynamic";

export default async function InboxSettingsPage() {
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
  const canEdit = ["owner", "admin"].includes(profile.role ?? "");

  const { data: org } = await supabase
    .from("organizations")
    .select("survey_kind, email_signature")
    .eq("id", profile.org_id)
    .maybeSingle();
  const surveyKind = (org?.survey_kind as "off" | "csat" | "nps") ?? "off";
  const emailSignature = (org?.email_signature as string | null) ?? "";

  // The org's own rating results so far.
  const admin = createAdminClient();
  const { data: ratings } = await admin
    .from("conversation_ratings")
    .select("kind, score")
    .eq("org_id", profile.org_id)
    .not("score", "is", null)
    .is("deleted_at", null);

  const csat = (ratings ?? []).filter((r) => r.kind === "csat" && typeof r.score === "number");
  const nps = (ratings ?? []).filter((r) => r.kind === "nps" && typeof r.score === "number");
  const csatAvg = csat.length
    ? (csat.reduce((s, r) => s + (r.score as number), 0) / csat.length).toFixed(2)
    : null;
  let npsScore: number | null = null;
  if (nps.length) {
    const promoters = nps.filter((r) => (r.score as number) >= 9).length;
    const detractors = nps.filter((r) => (r.score as number) <= 6).length;
    npsScore = Math.round(((promoters - detractors) / nps.length) * 100);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Automatic feedback surveys and inbox preferences.
          </p>
        </header>

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Customer satisfaction surveys</CardTitle>
            <CardDescription>
              When a conversation is closed, automatically send the customer a
              one-tap rating link on their channel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SurveySettings initial={surveyKind} canEdit={canEdit} />
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Email reply signature</CardTitle>
            <CardDescription>
              HTML appended below every email reply your agents send (a branded
              footer / sign-off). Sanitized automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailSignatureSettings initial={emailSignature} canEdit={canEdit} />
          </CardContent>
        </Card>

        {(csatAvg || npsScore !== null) && (
          <Card className="border-white/10 bg-card/60">
            <CardHeader>
              <CardTitle className="text-base">Your results</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-8">
              {csatAvg && (
                <div>
                  <p className="text-xs text-white/50">CSAT (avg / 5)</p>
                  <p className="text-2xl font-semibold">{csatAvg}</p>
                  <p className="text-[11px] text-white/40">{csat.length} responses</p>
                </div>
              )}
              {npsScore !== null && (
                <div>
                  <p className="text-xs text-white/50">NPS</p>
                  <p className="text-2xl font-semibold">{npsScore > 0 ? `+${npsScore}` : npsScore}</p>
                  <p className="text-[11px] text-white/40">{nps.length} responses</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
