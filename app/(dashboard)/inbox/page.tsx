import { Inbox } from "lucide-react";

export default function InboxPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <div className="rounded-2xl border border-white/10 bg-card/60 p-10">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full xyra-gradient">
          <Inbox className="size-6 text-white" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Your conversations will appear here once you connect your first channel.
          Channels ship next week.
        </p>
      </div>
    </div>
  );
}
