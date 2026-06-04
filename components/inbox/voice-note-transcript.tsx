"use client";

import { useState, useTransition } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { transcribeMessage } from "@/lib/inbox/transcription-actions";

// Shows a voice note's transcript under the audio player. If none exists yet,
// inbound notes get a "Transcribe" button (on-demand Whisper); outbound bot/
// agent audio shows nothing.
export function VoiceNoteTranscript({
  messageId,
  isOutbound,
  initialTranscript,
}: {
  messageId: string;
  isOutbound: boolean;
  initialTranscript?: string;
}) {
  const [transcript, setTranscript] = useState(initialTranscript ?? "");
  const [pending, startTransition] = useTransition();

  if (transcript) {
    return (
      <p className="flex gap-1 text-[11px] italic leading-snug text-white/70">
        <FileText className="mt-px size-3 shrink-0" />
        <span>{transcript}</span>
      </p>
    );
  }
  if (isOutbound) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await transcribeMessage(messageId);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          setTranscript(r.text);
        })
      }
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <FileText className="size-3" />
      )}
      {pending ? "Transcribing…" : "Transcribe"}
    </button>
  );
}
