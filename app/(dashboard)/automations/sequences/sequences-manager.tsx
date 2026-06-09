"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Clock, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createSequence,
  updateSequence,
  deleteSequence,
  type SequenceRow,
  type SequenceStep,
} from "@/lib/automations/sequences";

const UNIT_MIN = { minutes: 1, hours: 60, days: 1440 } as const;
type Unit = keyof typeof UNIT_MIN;

type EditStep = { value: number; unit: Unit; message: string };

function minutesToEdit(min: number): { value: number; unit: Unit } {
  if (min > 0 && min % UNIT_MIN.days === 0) return { value: min / UNIT_MIN.days, unit: "days" };
  if (min > 0 && min % UNIT_MIN.hours === 0) return { value: min / UNIT_MIN.hours, unit: "hours" };
  return { value: min, unit: "minutes" };
}
function editToMinutes(s: EditStep): number {
  return Math.max(0, Math.floor(s.value)) * UNIT_MIN[s.unit];
}
function stepsToEdit(steps: SequenceStep[]): EditStep[] {
  return steps.map((s) => ({ ...minutesToEdit(s.delay_minutes), message: s.message }));
}

export function SequencesManager({
  initial,
  canManage,
}: {
  initial: SequenceRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // null = list view; "new" = creating; otherwise the id being edited.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<EditStep[]>([]);

  function startCreate() {
    setName("");
    setSteps([{ value: 0, unit: "minutes", message: "" }]);
    setEditing("new");
  }
  function startEdit(seq: SequenceRow) {
    setName(seq.name);
    setSteps(seq.steps.length ? stepsToEdit(seq.steps) : [{ value: 0, unit: "minutes", message: "" }]);
    setEditing(seq.id);
  }
  function cancel() {
    setEditing(null);
    setName("");
    setSteps([]);
  }

  function updateStep(i: number, patch: Partial<EditStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { value: 1, unit: "hours", message: "" }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    const payloadSteps: SequenceStep[] = steps.map((s) => ({
      delay_minutes: editToMinutes(s),
      message: s.message.trim(),
    }));
    if (!name.trim()) return toast.error("Name is required.");
    if (payloadSteps.length === 0) return toast.error("Add at least one step.");
    if (payloadSteps.some((s) => !s.message)) return toast.error("Every step needs a message.");
    startTransition(async () => {
      const r =
        editing === "new"
          ? await createSequence({ name, steps: payloadSteps })
          : await updateSequence({ id: editing!, name, steps: payloadSteps });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editing === "new" ? "Sequence created." : "Sequence saved.");
      cancel();
      router.refresh();
    });
  }

  function onToggleActive(seq: SequenceRow) {
    startTransition(async () => {
      const r = await updateSequence({ id: seq.id, name: seq.name, steps: seq.steps, active: !seq.active });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this sequence? Contacts already enrolled finish their current drip.")) return;
    startTransition(async () => {
      const r = await deleteSequence(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Sequence deleted.");
      router.refresh();
    });
  }

  if (editing) {
    return (
      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">
            {editing === "new" ? "New sequence" : "Edit sequence"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs text-white/60">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New-lead nurture"
              maxLength={120}
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">
              Steps (sent in order)
            </p>
            {steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-white/50">
                  <GripVertical className="size-3.5" />
                  <span>Step {i + 1}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    <span>{i === 0 ? "Wait before sending" : "Then wait"}</span>
                    <Input
                      type="number"
                      min={0}
                      value={s.value}
                      onChange={(e) => updateStep(i, { value: Number(e.target.value) })}
                      className="h-7 w-16 px-2"
                    />
                    <select
                      value={s.unit}
                      onChange={(e) => updateStep(i, { unit: e.target.value as Unit })}
                      className="h-7 rounded-md border border-white/10 bg-[#1F1033] px-1.5 text-xs"
                    >
                      <option value="minutes">min</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(i)}
                        aria-label="Remove step"
                        className="ml-1 text-white/40 hover:text-rose-400"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <Textarea
                  value={s.message}
                  onChange={(e) => updateStep(i, { message: e.target.value })}
                  placeholder="Message… (supports {{first_name}}, {{contact_name}})"
                  rows={2}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addStep}
              className="border-white/10"
            >
              <Plus className="mr-1.5 size-3.5" /> Add step
            </Button>
          </div>

          <div className="flex justify-end gap-2 border-t border-white/5 pt-4">
            <Button type="button" variant="ghost" onClick={cancel} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={pending}
              className="xyra-gradient text-white border-0 hover:opacity-90"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save sequence"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Button
          onClick={startCreate}
          className="xyra-gradient text-white border-0 hover:opacity-90"
        >
          <Plus className="mr-1.5 size-4" /> New sequence
        </Button>
      )}

      {initial.length === 0 ? (
        <Card className="border-white/10 bg-card/60">
          <CardContent className="py-10 text-center text-sm text-white/50">
            No sequences yet. Create one, then enroll contacts with the{" "}
            <em>Add to sequence</em> action in any automation.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {initial.map((seq) => (
            <li key={seq.id}>
              <Card className="border-white/10 bg-card/60">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{seq.name}</p>
                      <Badge
                        variant="outline"
                        className={
                          seq.active
                            ? "h-5 border-emerald-400/30 bg-emerald-400/15 px-1.5 text-[10px] text-emerald-300"
                            : "h-5 border-white/15 bg-white/5 px-1.5 text-[10px] text-white/50"
                        }
                      >
                        {seq.active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-white/50">
                      {seq.steps.length} step{seq.steps.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleActive(seq)}
                        disabled={pending}
                        className="h-8 text-xs text-white/60 hover:text-white"
                      >
                        {seq.active ? "Pause" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(seq)}
                        className="h-8 text-white/60 hover:text-white"
                        aria-label="Edit sequence"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(seq.id)}
                        className="h-8 text-white/60 hover:bg-rose-500/10 hover:text-rose-300"
                        aria-label="Delete sequence"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
