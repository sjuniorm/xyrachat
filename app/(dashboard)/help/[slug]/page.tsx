import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HELP_ARTICLES, getArticle } from "../help-content";

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  return { title: article ? `${article.title} · Help` : "Help · Xyra Chat" };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[200px_1fr]">
        {/* Article nav */}
        <aside className="hidden lg:block">
          <Link
            href="/help"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            Help center
          </Link>
          <nav className="space-y-0.5">
            {HELP_ARTICLES.map((a) => {
              const active = a.slug === slug;
              return (
                <Link
                  key={a.slug}
                  href={`/help/${a.slug}`}
                  className={`block rounded-md px-2.5 py-1.5 text-[13px] transition ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {a.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <article className="min-w-0">
          <Link
            href="/help"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white lg:hidden"
          >
            <ArrowLeft className="size-3.5" />
            Help center
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {article.title}
          </h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            {article.summary}
          </p>
          <div className="space-y-3 text-sm">{article.body()}</div>
        </article>
      </div>
    </div>
  );
}
