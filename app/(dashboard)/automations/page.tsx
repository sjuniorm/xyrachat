import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function AutomationsPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full xyra-gradient">
          <Sparkles className="size-6 text-white" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Automations</h1>
        <p className="mt-2 text-sm text-white/60">
          Story-reply auto-responses, comment auto-replies, and rule-based
          routing — the no-code workflow layer on top of your inbox.
        </p>
        <p className="mt-3 text-xs text-white/40">Ships Week 10.</p>
        <p className="mt-4 text-xs text-white/60">
          Looking for AI chatbots? They live in{" "}
          <Link href="/bots" className="underline hover:text-white">
            Bots
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
