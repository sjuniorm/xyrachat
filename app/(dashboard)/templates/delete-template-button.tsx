"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteTemplate } from "@/lib/templates/actions";

// Delete a WhatsApp template — removes it on Meta (frees the name) + locally.
// Owner/admin only (the server action enforces it too).
export function DeleteTemplateButton({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (
      !window.confirm(
        `Delete the template "${templateName}"? This removes it from Xyra and from Meta (the name becomes reusable). This can't be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteTemplate(templateId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Template deleted");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={onDelete}
      className="h-7 gap-1.5 text-xs text-white/60 hover:bg-red-500/10 hover:text-red-300"
    >
      <Trash2 className="size-3" />
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
