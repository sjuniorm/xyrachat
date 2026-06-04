import Link from "next/link";
import { LifeBuoy, BookOpen, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { HELP_ARTICLES } from "./help-content";

export const metadata = { title: "Help · Xyra Chat" };

export default function HelpIndexPage() {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-5 text-[color:var(--xyra-glow)]" />
            <h1 className="text-2xl font-semibold tracking-tight">Help center</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Guides for getting the most out of Xyra Chat. Building an
            integration? See the{" "}
            <Link
              href="/docs/api"
              className="text-[color:var(--xyra-glow)] underline-offset-2 hover:underline"
            >
              developer API docs
            </Link>
            .
          </p>
        </header>

        <ul className="grid gap-3 sm:grid-cols-2">
          {HELP_ARTICLES.map((a) => {
            const Icon = a.icon;
            return (
              <li key={a.slug}>
                <Link href={`/help/${a.slug}`} className="group block h-full">
                  <Card className="h-full border-white/10 bg-card/60 transition group-hover:border-white/20 group-hover:bg-card/80">
                    <CardContent className="flex h-full flex-col gap-2 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-white/5 text-[color:var(--xyra-glow)]">
                          <Icon className="size-4" />
                        </span>
                        <h2 className="text-sm font-medium text-white">
                          {a.title}
                        </h2>
                      </div>
                      <p className="flex-1 text-xs leading-relaxed text-white/60">
                        {a.summary}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[11px] text-white/40 group-hover:text-white/70">
                        Read <ArrowRight className="size-3" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-8 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/70">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-white/40" />
          <p>
            Can&apos;t find what you need? Email{" "}
            <a
              href="mailto:support@xyrachat.com"
              className="text-[color:var(--xyra-glow)] underline-offset-2 hover:underline"
            >
              support@xyrachat.com
            </a>{" "}
            and we&apos;ll help.
          </p>
        </div>
      </div>
    </div>
  );
}
