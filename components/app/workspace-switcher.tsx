"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createWorkspace } from "@/lib/workspace/actions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Workspace = {
  org_id: string;
  name: string;
  role: string;
  active: boolean;
};

export function WorkspaceSwitcher() {
  const [supabase] = useState(() => createClient());
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: me } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const active = (me as { org_id: string | null } | null)?.org_id;
    const { data } = await supabase
      .from("memberships")
      .select("org_id, role, organizations(name)")
      .is("deleted_at", null);
    const list: Workspace[] = (
      (data as Array<{
        org_id: string;
        role: string;
        organizations: { name: string } | null;
      }> | null) ?? []
    ).map((m) => ({
      org_id: m.org_id,
      role: m.role,
      name: m.organizations?.name ?? "Workspace",
      active: m.org_id === active,
    }));
    list.sort((a, b) =>
      a.active === b.active ? a.name.localeCompare(b.name) : a.active ? -1 : 1,
    );
    setWorkspaces(list);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const switchTo = async (orgId: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("switch_active_org", {
      p_org_id: orgId,
    });
    if (error) {
      setBusy(false);
      return;
    }
    // Full reload so every server-rendered, org-scoped view refetches.
    window.location.assign("/inbox");
  };

  const create = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    const res = await createWorkspace(newName);
    if (!res.ok) {
      setBusy(false);
      return;
    }
    window.location.assign("/inbox");
  };

  const active = workspaces.find((w) => w.active);
  if (workspaces.length === 0) return null;

  return (
    <div className="px-3 pb-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-left text-sm text-white transition hover:bg-white/10">
            <span className="truncate font-medium">
              {active?.name ?? "Workspace"}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-white/50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-60 border-white/10 bg-[#1F1033] p-1 text-white"
        >
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">
            Workspaces
          </p>
          {workspaces.map((w) => (
            <button
              key={w.org_id}
              disabled={busy}
              onClick={() => (w.active ? setOpen(false) : switchTo(w.org_id))}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              <span className="truncate">{w.name}</span>
              {w.active ? (
                <Check className="size-4 shrink-0 text-[#D882FF]" />
              ) : null}
            </button>
          ))}

          <div className="mt-1 border-t border-white/10 pt-1">
            {creating ? (
              <div className="flex flex-col gap-2 p-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void create();
                  }}
                  placeholder="New workspace name"
                  className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-white placeholder:text-white/40 focus:border-[#D882FF] focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void create()}
                    disabled={!newName.trim() || busy}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-gradient-to-br from-[#9333EA] to-[#EC4899] px-2 py-1.5 text-sm font-semibold disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : "Create"}
                  </button>
                  <button
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                    }}
                    className="rounded-md px-2 py-1.5 text-sm text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                <Plus className="size-4" />
                Create workspace
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
