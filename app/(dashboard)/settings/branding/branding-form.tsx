"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { updateBranding } from "@/lib/branding/actions";

type Initial = { brandName: string; logoUrl: string | null; accentColor: string | null; hidePoweredBy: boolean };

export function BrandingForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [brandName, setBrandName] = useState(initial.brandName === "Xyra Chat" ? "" : initial.brandName);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [accentColor, setAccentColor] = useState(initial.accentColor ?? "");
  const [hidePoweredBy, setHidePoweredBy] = useState(initial.hidePoweredBy);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateBranding({ brandName, logoUrl, accentColor, hidePoweredBy });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Branding saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Brand name" help="Shown to your customers in the web chat (replaces “Xyra Chat”).">
        <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Xyra Chat" maxLength={60} />
      </Field>
      <Field label="Logo URL" help="A public https image URL.">
        <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" />
      </Field>
      <Field label="Accent color" help="Hex like #9333EA. Used for the web-chat widget.">
        <div className="flex items-center gap-2">
          <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#9333EA" className="font-mono" />
          {/^#[0-9a-fA-F]{6}$/.test(accentColor) && (
            <span className="size-7 shrink-0 rounded-md ring-1 ring-white/10" style={{ background: accentColor }} />
          )}
        </div>
      </Field>
      <div className="flex items-start justify-between gap-4 border-t border-white/5 pt-4">
        <div>
          <p className="text-sm text-white">Hide “Powered by Xyra Chat”</p>
          <p className="text-xs text-white/55">Removes the Xyra credit from the web-chat widget.</p>
        </div>
        <Switch checked={hidePoweredBy} disabled={pending} onCheckedChange={setHidePoweredBy} />
      </div>
      <Button onClick={save} disabled={pending} className="xyra-gradient text-white">
        {pending ? "Saving…" : "Save branding"}
      </Button>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-white">{label}</label>
      <p className="mb-1.5 text-xs text-white/55">{help}</p>
      {children}
    </div>
  );
}
