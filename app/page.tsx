import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { XyraWordmark } from "@/components/brand/xyra-wordmark";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 size-[640px] -translate-x-1/2 rounded-full opacity-25 blur-3xl xyra-gradient"
      />
      <div className="relative flex flex-col items-center">
        <XyraWordmark size="lg" variant="stacked" />
        <h1 className="mt-6 max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          One inbox for every customer conversation.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-balance text-muted-foreground">
          WhatsApp, Instagram, Messenger and live chat — unified, automated, and built for teams.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild className="xyra-gradient text-white border-0 hover:opacity-90">
            <Link href="/signup">Get started</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/20">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
