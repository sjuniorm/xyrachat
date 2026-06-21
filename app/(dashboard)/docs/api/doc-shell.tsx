// Shared scaffolding for the docs pages. Server components — these are
// pure presentational helpers.

export function DocShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {intro && <p className="mt-1 text-sm text-muted-foreground">{intro}</p>}
        </header>
        <div className="space-y-8 text-sm text-white/80">{children}</div>
      </div>
    </div>
  );
}

export function DocSection({
  n,
  title,
  children,
}: {
  n?: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-base font-medium text-white">
        {n != null && (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/10 text-[10px] text-white/80">
            {n}
          </span>
        )}
        {title}
      </h2>
      <div className="space-y-3 leading-relaxed text-white/70">{children}</div>
    </section>
  );
}

export function Code({
  children,
}: {
  // `language` is accepted for call-site readability but not used in rendering.
  language?: string;
  children: string;
}) {
  return (
    <pre className="overflow-x-auto rounded-md border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-white/90">
      <code>{children}</code>
    </pre>
  );
}
