"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { identify } from "@/lib/analytics";
import { Turnstile, isCaptchaEnabled } from "@/components/auth/turnstile";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isCaptchaEnabled() && !captchaToken) {
      toast.error("Please complete the verification.");
      return;
    }
    setPending(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken ?? undefined },
    });
    setPending(false);
    if (error) {
      toast.error(error.message);
      // Token is single-use — remount for a fresh one before the next try.
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
      return;
    }
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id, organizations(plan)")
        .eq("id", data.user.id)
        .maybeSingle();
      identify(data.user.id, {
        email: data.user.email ?? null,
        org_id: profile?.org_id ?? null,
        plan:
          (profile as { organizations?: { plan?: string } } | null)?.organizations?.plan ??
          null,
      });
    }
    // Only follow a SAME-ORIGIN relative path. A bare startsWith("/") check
    // lets "//evil.com" and "/\evil.com" through (protocol-relative → the
    // router hard-navigates cross-origin → open-redirect phishing).
    const raw = params.get("next");
    const next =
      raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")
        ? raw
        : "/dashboard";
    router.push(next);
    router.refresh();
  }

  return (
    <Card className="border-white/10 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your Xyra Chat account.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Turnstile key={captchaKey} onToken={setCaptchaToken} />
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            disabled={pending}
            className="w-full xyra-gradient text-white border-0 hover:opacity-90"
          >
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/signup" className="text-foreground hover:underline">
              Create one
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
