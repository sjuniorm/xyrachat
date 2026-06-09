"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type ClientRow = {
  id: string;
  name: string;
  created_at: string;
  plan: string;
  status: string;
  trial_ends_at: string | null;
  provisioned: boolean;
};

const STATUS_STYLE: Record<string, string> = {
  active: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300",
  trialing: "border-sky-400/30 bg-sky-400/15 text-sky-300",
  past_due: "border-amber-400/30 bg-amber-400/15 text-amber-200",
  canceled: "border-white/15 bg-white/5 text-white/50",
};

export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? rows.filter((r) => `${r.name} ${r.plan} ${r.status}`.toLowerCase().includes(q.trim().toLowerCase()))
    : rows;

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/40" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients…"
          className="pl-8"
        />
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs text-white/50">
            <tr>
              <th className="px-3 py-2 font-medium">Organization</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Trial ends</th>
              <th className="px-3 py-2 font-medium">Provisioned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-white/5">
                <td className="px-3 py-2.5">
                  <Link href={`/settings/admin/clients/${r.id}`} className="font-medium text-white hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-[11px] text-white/40">
                    joined {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-3 py-2.5 capitalize text-white/80">{r.plan}</td>
                <td className="px-3 py-2.5">
                  <Badge
                    variant="outline"
                    className={`h-5 px-1.5 text-[10px] ${STATUS_STYLE[r.status] ?? "border-white/15 bg-white/5 text-white/60"}`}
                  >
                    {r.status}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-white/60">
                  {r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {r.provisioned ? (
                    <span className="text-emerald-300">✓</span>
                  ) : (
                    <span className="text-amber-300">needs backfill</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-white/40">
                  No clients match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
