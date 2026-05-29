"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  provisionOrgBundle,
  backfillUnprovisionedOrgs,
  grantEntitlement,
  revokeEntitlement,
} from "@/lib/billing/admin-actions";

type Ent = { id: string; feature_key: string; value: string; source: string; expires_at: string | null };
type Org = {
  id: string;
  name: string;
  plan: string;
  status: string;
  entitlements: Ent[];
  provisioned: boolean;
};

const BUNDLE_IDS = ["trial", "starter", "pro", "enterprise"] as const;

export function EntitlementsAdmin({ orgs }: { orgs: Org[] }) {
  const [busy, startTransition] = useTransition();
  const [openOrg, setOpenOrg] = useState<string | null>(orgs[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-card/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Launch backfill</CardTitle>
            <p className="mt-1 text-xs text-white/60">
              One click: provision every org that has no entitlements yet to
              the Trial bundle. Run this once at launch, then bump individuals.
            </p>
          </div>
          <Button
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const res = await backfillUnprovisionedOrgs("trial");
                if (!res.ok) toast.error(res.error);
                else toast.success(`Backfilled ${res.data?.count ?? 0} org(s) to Trial`);
              })
            }
            className="xyra-gradient text-white border-0 hover:opacity-90"
          >
            <Zap className="mr-1.5 size-4" />
            Backfill all
          </Button>
        </CardHeader>
      </Card>

      {orgs.map((org) => (
        <Card key={org.id} className="border-white/10 bg-card/60">
          <CardHeader className="cursor-pointer" onClick={() => setOpenOrg(openOrg === org.id ? null : org.id)}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="truncate text-base">{org.name}</CardTitle>
                <p className="mt-0.5 font-mono text-[10px] text-white/40">{org.id}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="h-5 border-white/15 bg-white/5 px-1.5 text-[10px] text-white/70">
                  {org.plan}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    org.provisioned
                      ? "h-5 border-emerald-400/30 bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300"
                      : "h-5 border-amber-400/30 bg-amber-400/15 px-1.5 text-[10px] text-amber-300"
                  }
                >
                  {org.provisioned ? `${org.entitlements.length} entitlements` : "fail-open"}
                </Badge>
              </div>
            </div>
          </CardHeader>

          {openOrg === org.id && (
            <CardContent className="space-y-4">
              {/* Bundle provisioning */}
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/50">
                  Provision a bundle (replaces all bundle:* rows)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BUNDLE_IDS.map((b) => (
                    <Button
                      key={b}
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await provisionOrgBundle(org.id, b);
                          if (!res.ok) toast.error(res.error);
                          else toast.success(`Provisioned ${b} (${res.data?.provisioned} entitlements)`);
                        })
                      }
                      className="h-7 border-white/10 bg-white/5 text-[11px] capitalize hover:bg-white/10"
                    >
                      {b}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Current entitlement rows */}
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/50">
                  Active entitlements
                </p>
                {org.entitlements.length === 0 ? (
                  <p className="text-xs text-white/50">
                    None — this org fails open (all features allowed) until provisioned.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/5 text-xs">
                    {org.entitlements
                      .slice()
                      .sort((a, b) => a.feature_key.localeCompare(b.feature_key))
                      .map((e) => (
                        <li key={e.id} className="flex items-center gap-2 py-1.5">
                          <code className="flex-1 text-white/80">{e.feature_key}</code>
                          <span className="font-mono text-white/90">{e.value}</span>
                          <Badge variant="outline" className="h-4 border-white/15 bg-white/5 px-1 text-[9px] text-white/50">
                            {e.source}
                          </Badge>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              startTransition(async () => {
                                const res = await revokeEntitlement(e.id);
                                if (!res.ok) toast.error(res.error);
                                else toast.success("Revoked");
                              })
                            }
                            className="text-white/40 hover:text-red-300"
                            aria-label="Revoke"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              {/* Manual grant */}
              <GrantRow orgId={org.id} busy={busy} startTransition={startTransition} />
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function GrantRow({
  orgId,
  busy,
  startTransition,
}: {
  orgId: string;
  busy: boolean;
  startTransition: (cb: () => Promise<void>) => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2.5">
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/50">
        Grant / override a single entitlement (source = manual)
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px]">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="feature_key (e.g. channels:max)"
            className="h-8 text-xs"
          />
        </div>
        <div className="w-28">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="value"
            className="h-8 text-xs"
          />
        </div>
        <Button
          size="sm"
          disabled={busy || !key.trim() || !value.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await grantEntitlement({ targetOrgId: orgId, featureKey: key, value });
              if (!res.ok) toast.error(res.error);
              else {
                toast.success("Granted");
                setKey("");
                setValue("");
              }
            })
          }
          className="h-8 xyra-gradient text-white border-0 hover:opacity-90"
        >
          <Plus className="mr-1 size-3.5" />
          Grant
        </Button>
      </div>
      <p className="mt-1.5 text-[10px] text-white/40">
        Numbers: <code>1000</code> or <code>-1</code> (unlimited). Booleans:{" "}
        <code>true</code> / <code>false</code>.
      </p>
    </div>
  );
}
