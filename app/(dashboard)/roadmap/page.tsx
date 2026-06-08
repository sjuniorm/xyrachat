import { Lightbulb } from "lucide-react";
import { CannyBoard } from "@/components/app/canny-board";

export const metadata = { title: "Roadmap · Xyra Chat" };

export default function RoadmapPage() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <div className="flex items-center gap-2">
            <Lightbulb className="size-5 text-[color:var(--xyra-glow)]" />
            <h1 className="text-2xl font-semibold tracking-tight">Roadmap</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            See what we&apos;re building, submit ideas, and vote on what matters
            most to you.
          </p>
        </header>
        <CannyBoard />
      </div>
    </div>
  );
}
