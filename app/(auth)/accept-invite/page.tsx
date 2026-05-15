"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

// When a teammate clicks the invite email, Supabase signs them in via the
// magic-link verify endpoint and lands them here. They're logged in but
// have no password yet — historically we sent them straight to /dashboard,
// which left invitees stranded (sign out + sign back in = "invalid login
// credentials"). This page forces them to set a password first.
export default function AcceptInvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setHasSession(Boolean(data.user));
      setEmail(data.user?.email ?? null);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("You're all set.");
    router.push("/dashboard");
    router.refresh();
  }

  if (hasSession === false) {
    return (
      <Card className="border-white/10 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Invite link is no longer valid</CardTitle>
          <CardDescription>
            Ask whoever invited you to send a fresh invite from{" "}
            <strong>Settings → Team</strong>.
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
        <CardTitle>Welcome to Xyra Chat</CardTitle>
        <CardDescription>
          {email ? (
            <>Set a password for <strong>{email}</strong> so you can sign back in later.</>
          ) : (
            <>Set a password so you can sign back in later.</>
          )}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={pending || hasSession === null}
            className="w-full xyra-gradient text-white border-0 hover:opacity-90"
          >
            {pending ? "Saving…" : "Continue to dashboard"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
