import { Bot } from "lucide-react";

export default function AutomationsPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full xyra-gradient">
          <Bot className="size-6 text-white" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Automations</h1>
        <p className="mt-2 text-sm text-white/60">
          Build AI bots that answer customer questions from your knowledge base,
          route conversations and trigger workflows.
        </p>
        <p className="mt-3 text-xs text-white/40">Ships Week 6.</p>
      </div>
    </div>
  );
}
