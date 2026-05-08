import { Inbox } from "lucide-react";

export default function InboxIndexPage() {
  return (
    <div
      className="flex flex-1 items-center justify-center px-8 text-center"
      style={{ background: "color-mix(in oklab, var(--xyra-bg) 92%, black)" }}
    >
      <div>
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full xyra-gradient">
          <Inbox className="size-6 text-white" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Select a conversation
        </h1>
        <p className="mt-2 max-w-sm text-sm text-white/60">
          Pick a conversation from the list to start replying. Use{" "}
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>{" "}
          to search.
        </p>
      </div>
    </div>
  );
}
