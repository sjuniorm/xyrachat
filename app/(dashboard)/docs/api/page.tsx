import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SwaggerEmbed } from "./swagger-embed";

export default async function ApiDocsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex-1 overflow-y-auto px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">API reference</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Full REST API spec, generated from <code>/api/v1/openapi.json</code>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Link href="/docs/api/quickstart" className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:bg-white/10">Quickstart</Link>
            <Link href="/docs/api/auth" className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:bg-white/10">Auth + scopes</Link>
            <Link href="/docs/api/idempotency" className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:bg-white/10">Idempotency</Link>
            <Link href="/docs/api/errors" className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:bg-white/10">Errors</Link>
            <Link href="/docs/api/webhooks" className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:bg-white/10">Webhooks + signatures</Link>
          </div>
        </header>
        <div className="rounded-lg border border-white/10 bg-white p-2 text-black">
          <SwaggerEmbed />
        </div>
      </div>
    </div>
  );
}
