import { createAdminClient } from "@/lib/supabase/admin";
import { RatingForm } from "./rating-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rate your experience" };

const TOKEN_RE = /^[a-f0-9]{32}$/;

export default async function RatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let kind: "csat" | "nps" | null = null;
  let alreadyRated = false;
  if (TOKEN_RE.test(token)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("conversation_ratings")
      .select("kind, rated_at")
      .eq("token", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) {
      kind = data.kind as "csat" | "nps";
      alreadyRated = Boolean(data.rated_at);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0B0418] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1F1033] p-8 shadow-2xl">
        {!kind ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Link expired</h1>
            <p className="mt-2 text-sm text-white/60">
              This rating link is invalid or has already been used.
            </p>
          </div>
        ) : alreadyRated ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold">Thanks! 🙌</h1>
            <p className="mt-2 text-sm text-white/60">
              You&apos;ve already shared your feedback. We appreciate it.
            </p>
          </div>
        ) : (
          <RatingForm token={token} kind={kind} />
        )}
      </div>
    </main>
  );
}
