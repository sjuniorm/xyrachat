"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionResult = { error?: string } | undefined;

export function OnboardingForm({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Card className="border-white/10 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
        <CardDescription>
          One workspace per company. You can invite teammates after.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Acme Inc."
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={pending || !name.trim()}
            className="w-full xyra-gradient text-white border-0 hover:opacity-90"
          >
            {pending ? "Creating…" : "Create organization"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
