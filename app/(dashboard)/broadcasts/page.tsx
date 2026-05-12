import { Megaphone } from "lucide-react";

export default function BroadcastsPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full xyra-gradient">
          <Megaphone className="size-6 text-white" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Broadcasts</h1>
        <p className="mt-2 text-sm text-white/60">
          Send WhatsApp template messages to thousands of contacts at once, with
          segmentation and delivery tracking.
        </p>
        <p className="mt-3 text-xs text-white/40">Ships Week 8.</p>
      </div>
    </div>
  );
}
