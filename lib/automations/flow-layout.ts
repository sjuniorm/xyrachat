// Pure layout: turn an automation's trigger + linear actions array into a
// positioned node/edge graph for the read-only flow canvas. No React here so
// it's safe to unit-test / import anywhere. if/else branches render as left
// (then) and right (else) side-columns off the condition node; the main spine
// continues straight down (matching the executor: branches run inline, then
// the next top-level action runs regardless).
import type { Action, LeafAction } from "./types";

export type FlowNodeData = {
  kind: string;
  title: string;
  subtitle?: string;
  tone: "trigger" | "message" | "tag" | "assign" | "webhook" | "wait" | "condition" | "neutral";
};
export type FlowNode = {
  id: string;
  type: "flowNode";
  position: { x: number; y: number };
  data: FlowNodeData;
};
export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

const ROW_H = 108;
const BRANCH_DX = 270;

function clip(s: string, n = 48): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function leafSummary(a: LeafAction): FlowNodeData {
  switch (a.type) {
    case "send_dm":
      return { kind: a.type, tone: "message", title: "Send DM", subtitle: clip(a.text || "(empty)") };
    case "reply_comment":
      return { kind: a.type, tone: "message", title: "Reply to comment", subtitle: clip(a.text || "(empty)") };
    case "send_link_button":
      return { kind: a.type, tone: "message", title: "Link button", subtitle: clip(a.url || a.text || "(no link)") };
    case "tag_contact":
      return { kind: a.type, tone: "tag", title: "Tag contact", subtitle: a.tag || "(no tag)" };
    case "assign_agent":
      return { kind: a.type, tone: "assign", title: "Assign agent", subtitle: a.agent_id ? "to a teammate" : "unassign" };
    case "assign_smart":
      return { kind: a.type, tone: "assign", title: "Smart routing", subtitle: a.strategy === "round_robin" ? "round-robin" : "least busy" };
    case "webhook":
      return { kind: a.type, tone: "webhook", title: "Webhook", subtitle: clip(a.url || "(no url)") };
    case "add_to_sequence":
      return { kind: a.type, tone: "neutral", title: "Add to sequence", subtitle: a.sequence_id ? "enroll contact" : "(pick a sequence)" };
  }
}

function msFriendly(ms: number): string {
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000}d`;
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  return `${Math.max(1, Math.round(ms / 60_000))}m`;
}

function conditionSummary(a: Extract<Action, { type: "condition" }>): string {
  const parts = a.conditions.map((c) => {
    if (c.field === "tag") return `tag ${c.op === "has" ? "has" : "≠"} ${c.value || "?"}`;
    if (c.field === "reply") return c.op === "received" ? "replied" : "no reply";
    return `msg ${c.op === "contains" ? "has" : "≠"} ${c.value || "?"}`;
  });
  return clip(parts.join(a.match === "all" ? " AND " : " OR "), 56);
}

function topSummary(a: Action): FlowNodeData {
  if (a.type === "wait") {
    return { kind: a.type, tone: "wait", title: "Wait", subtitle: msFriendly(a.ms) };
  }
  if (a.type === "wait_for_reply") {
    return {
      kind: a.type,
      tone: "wait",
      title: "Wait for reply",
      subtitle: `timeout ${msFriendly(a.timeout_ms ?? 86_400_000)}`,
    };
  }
  if (a.type === "condition") {
    return { kind: a.type, tone: "condition", title: "If / else", subtitle: conditionSummary(a) };
  }
  if (a.type === "ai_branch") {
    const labels = (a.intents ?? []).map((it) => it.label || "?").filter(Boolean);
    return {
      kind: a.type,
      tone: "condition",
      title: "AI intent split",
      subtitle: clip(labels.length ? labels.join(" · ") : "(no intents)", 56),
    };
  }
  if (a.type === "send_buttons") {
    const n = a.buttons?.length ?? 0;
    return {
      kind: a.type,
      tone: "message",
      title: "Send buttons",
      subtitle: clip(a.text || `${n} opt-in button${n === 1 ? "" : "s"}`, 56),
    };
  }
  return leafSummary(a);
}

export function buildFlow(
  triggerLabel: string,
  actions: Action[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  nodes.push({
    id: "trigger",
    type: "flowNode",
    position: { x: 0, y: 0 },
    data: { kind: "trigger", tone: "trigger", title: "Trigger", subtitle: triggerLabel },
  });
  let prev = "trigger";
  let row = 1;

  actions.forEach((a, i) => {
    const id = `a${i}`;
    const data = topSummary(a);
    nodes.push({ id, type: "flowNode", position: { x: 0, y: row * ROW_H }, data });
    edges.push({ id: `e-${prev}-${id}`, source: prev, target: id });

    if (a.type === "condition") {
      const layBranch = (leaves: LeafAction[], side: "then" | "else", dx: number): number => {
        let bprev = id;
        let brow = row + 1;
        leaves.forEach((leaf, j) => {
          const lid = `${id}-${side}-${j}`;
          nodes.push({ id: lid, type: "flowNode", position: { x: dx, y: brow * ROW_H }, data: leafSummary(leaf) });
          edges.push({
            id: `e-${bprev}-${lid}`,
            source: bprev,
            target: lid,
            ...(j === 0 ? { label: side === "then" ? "then" : "else" } : {}),
          });
          bprev = lid;
          brow += 1;
        });
        return brow;
      };
      const thenEnd = layBranch(a.then, "then", -BRANCH_DX);
      const elseEnd = layBranch(a.else, "else", BRANCH_DX);
      row = Math.max(row + 1, thenEnd, elseEnd);
      prev = id; // the spine continues from the condition
    } else if (a.type === "ai_branch") {
      // N intent columns + an "else" column, spread/centered around the spine.
      const branches: Array<{ leaves: LeafAction[]; label: string; key: string }> = [
        ...(a.intents ?? []).map((it, k) => ({
          leaves: it.then ?? [],
          label: it.label || `intent ${k + 1}`,
          key: `i${k}`,
        })),
        { leaves: a.else ?? [], label: "none", key: "else" },
      ];
      const mid = (branches.length - 1) / 2;
      let maxRow = row + 1;
      branches.forEach((br, k) => {
        const dx = (k - mid) * BRANCH_DX;
        let bprev = id;
        let brow = row + 1;
        br.leaves.forEach((leaf, j) => {
          const lid = `${id}-${br.key}-${j}`;
          nodes.push({ id: lid, type: "flowNode", position: { x: dx, y: brow * ROW_H }, data: leafSummary(leaf) });
          edges.push({
            id: `e-${bprev}-${lid}`,
            source: bprev,
            target: lid,
            ...(j === 0 ? { label: clip(br.label, 16) } : {}),
          });
          bprev = lid;
          brow += 1;
        });
        maxRow = Math.max(maxRow, brow);
      });
      row = maxRow;
      prev = id; // spine continues from the ai_branch node
    } else if (a.type === "send_buttons") {
      // Each opt-in button is its own column: an optional follow/opt-in gate
      // node, then the button's `then` (e.g. the link). With one button this is
      // a clean straight line below the node; multiple buttons fan out. This is
      // what the buttons actually DO — without it the node looks like a dead end.
      const btns = a.buttons ?? [];
      const mid = (btns.length - 1) / 2;
      let maxRow = row + 1;
      btns.forEach((b, k) => {
        const dx = (k - mid) * BRANCH_DX;
        let bprev = id;
        let brow = row + 1;
        let labelled = false;
        if (b.gate) {
          const gid = `${id}-b${k}-gate`;
          nodes.push({
            id: gid,
            type: "flowNode",
            position: { x: dx, y: brow * ROW_H },
            data: { kind: "send_dm", tone: "neutral", title: "Ask to follow", subtitle: clip(b.gate.text || "(follow step)", 40) },
          });
          edges.push({ id: `e-${bprev}-${gid}`, source: bprev, target: gid, label: clip(b.title, 16) });
          bprev = gid;
          brow += 1;
          labelled = true;
        }
        (b.then ?? []).forEach((leaf, j) => {
          const lid = `${id}-b${k}-${j}`;
          nodes.push({ id: lid, type: "flowNode", position: { x: dx, y: brow * ROW_H }, data: leafSummary(leaf) });
          edges.push({
            id: `e-${bprev}-${lid}`,
            source: bprev,
            target: lid,
            ...(!labelled && j === 0 ? { label: clip(b.title, 16) } : {}),
          });
          bprev = lid;
          brow += 1;
        });
        maxRow = Math.max(maxRow, brow);
      });
      row = maxRow;
      prev = id; // send_buttons is terminal, but keep the spine consistent
    } else {
      row += 1;
      prev = id;
    }
  });

  return { nodes, edges };
}
