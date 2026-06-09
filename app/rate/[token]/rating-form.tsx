"use client";

import { useState } from "react";

export function RatingForm({ token, kind }: { token: string; kind: "csat" | "nps" }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scores = kind === "nps" ? Array.from({ length: 11 }, (_, i) => i) : [1, 2, 3, 4, 5];
  const title =
    kind === "nps" ? "How likely are you to recommend us?" : "How was your experience?";

  async function submit() {
    if (score == null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, score, comment }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Something went wrong.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold">Thank you! 💜</h1>
        <p className="mt-2 text-sm text-white/60">Your feedback helps us improve.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-center text-lg font-semibold">{title}</h1>
      {kind === "nps" && (
        <div className="mt-1 flex justify-between px-1 text-[10px] text-white/40">
          <span>Not likely</span>
          <span>Very likely</span>
        </div>
      )}
      <div
        className={`mt-4 grid gap-2 ${kind === "nps" ? "grid-cols-6" : "grid-cols-5"}`}
      >
        {scores.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            className={`aspect-square rounded-lg border text-sm font-semibold transition ${
              score === n
                ? "border-transparent bg-[linear-gradient(135deg,#9333EA_0%,#EC4899_100%)] text-white"
                : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {kind === "csat" ? ["😞", "😕", "😐", "🙂", "😍"][n - 1] : n}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything else you'd like to tell us? (optional)"
        rows={3}
        maxLength={1000}
        className="mt-4 w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-white/40 focus:border-[color:var(--xyra-glow)] focus:outline-none"
      />
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={score == null || submitting}
        className="mt-4 w-full rounded-lg bg-[linear-gradient(135deg,#9333EA_0%,#EC4899_100%)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Submit feedback"}
      </button>
    </div>
  );
}
