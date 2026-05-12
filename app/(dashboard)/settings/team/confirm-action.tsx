"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Small inline "destructive button with a confirm dialog" — used for Remove
 * member and Cancel invite on the team page. Server action takes a FormData
 * with the hidden inputs you pass in `hidden`.
 */
export function ConfirmAction({
  action,
  hidden,
  buttonLabel,
  title,
  description,
  confirmLabel,
  confirmingLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  hidden: { name: string; value: string }[];
  buttonLabel: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  confirmingLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    const fd = new FormData();
    for (const h of hidden) fd.set(h.name, h.value);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${confirmLabel} ✓`);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-white/70 hover:bg-white/5 hover:text-white"
        >
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/10">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={run}
            disabled={pending}
            className="bg-red-500 text-white hover:bg-red-500/90 border-0"
          >
            {pending ? confirmingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
