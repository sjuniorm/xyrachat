"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { Turnstile } from "@/components/auth/turnstile";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return; // no double-submit (would reuse the captcha token)
    // Supabase is the source of truth for whether CAPTCHA is required — don't
    // hard-block here (avoids a false block when enforcement is off).
    setPending(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo, captchaToken: captchaToken ?? undefined },
    );
    setPending(false);
    if (error) {
      // Supabase intentionally doesn't expose whether the email exists, so a
      // real error here is usually transport / rate-limit. Show the message
      // but still flip to the "check your inbox" state to keep the UX
      // consistent (and not reveal account existence).
      toast.error(error.message);
      setCaptchaToken(null);
      setCaptchaKey((k) => k + 1);
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Card className="border-white/10 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            If an account exists for <strong>{email}</strong>, we just sent a
            password reset link. Click it to set a new password.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-3">
          <Button
            asChild
            variant="outline"
            className="w-full border-white/10"
          >
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
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
          <Turnstile key={captchaKey} onToken={setCaptchaToken} />
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            disabled={pending}
            className="w-full xyra-gradient text-white border-0 hover:opacity-90"
          >
            {pending ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link href="/login" className="text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
