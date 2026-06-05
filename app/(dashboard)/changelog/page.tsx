import { Rocket } from "lucide-react";
import { CHANGELOG, type ChangelogTag } from "@/lib/changelog";

export const metadata = { title: "What's new · Xyra Chat" };

const TAG_STYLES: Record<ChangelogTag, { label: string; className: string }> = {
  feature: {
    label: "New",
    className: "border-[color:var(--xyra-purple)]/30 bg-[color:var(--xyra-purple)]/20 text-[color:var(--xyra-glow)]",
  },
  improvement: {
    label: "Improved",
    className: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300",
  },
  fix: {
    label: "Fixed",
    className: "border-amber-400/30 bg-amber-400/15 text-amber-300",
  },
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function ChangelogPage() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <div className="flex items-center gap-2">
            <Rocket className="size-5 text-[color:var(--xyra-glow)]" />
            <h1 className="text-2xl font-semibold tracking-tight">What&apos;s new</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The latest features and improvements in Xyra Chat.
          </p>
        </header>

        <ol className="relative space-y-8 border-l border-white/10 pl-6">
          {CHANGELOG.map((entry) => {
            const tag = TAG_STYLES[entry.tag];
            return (
              <li key={entry.version} className="relative">
                {/* timeline node */}
                <span
                  className="absolute -left-[1.6rem] top-1.5 size-3 rounded-full border-2 border-[color:var(--xyra-bg)] bg-[color:var(--xyra-purple)]"
                  aria-hidden
                />
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-white">{entry.title}</h2>
                  <span
                    className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium ${tag.className}`}
                  >
                    {tag.label}
                  </span>
                  <span className="text-xs text-white/40">
                    v{entry.version} · {formatDate(entry.date)}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {entry.highlights.map((h, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-sm leading-relaxed text-white/70"
                    >
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-[color:var(--xyra-glow)]/60" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
