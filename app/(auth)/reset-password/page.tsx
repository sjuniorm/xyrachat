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

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // When the user arrives via Supabase's recovery link, the verify endpoint
  // sets a session cookie before redirecting here. If that didn't happen
  // (e.g. expired link, opened in a different browser), there's nothing to
  // reset — surface a "request a fresh link" prompt.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setHasSession(Boolean(data.user));
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
    toast.success("Password updated. You're signed in.");
    router.push("/dashboard");
    router.refresh();
  }

  if (hasSession === false) {
    return (
      <Card className="border-white/10 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Link is no longer valid</CardTitle>
          <CardDescription>
            Reset links expire quickly. Request a new one and try again.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-3">
          <Button
            asChild
            className="w-full xyra-gradient text-white border-0 hover:opacity-90"
          >
            <Link href="/forgot-password">Send a new link</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>
          Pick something you&apos;ll remember — at least 8 characters.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
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
            <Label htmlFor="confirm">Confirm new password</Label>
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
            {pending ? "Saving…" : "Update password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
