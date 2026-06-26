"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Zap,
  MessageSquare,
  Tag,
  UserPlus2,
  Webhook,
  Clock,
  GitBranch,
  Reply,
  CircleDot,
  Sparkles,
} from "lucide-react";
import { buildFlow, type FlowNodeData } from "@/lib/automations/flow-layout";
import type { Action } from "@/lib/automations/types";

const TONE: Record<
  FlowNodeData["tone"],
  { ring: string; bg: string; icon: typeof Zap }
> = {
  trigger: { ring: "ring-[color:var(--xyra-glow)]/50", bg: "bg-[color:var(--xyra-purple)]/20", icon: Zap },
  message: { ring: "ring-emerald-400/30", bg: "bg-emerald-400/10", icon: MessageSquare },
  tag: { ring: "ring-sky-400/30", bg: "bg-sky-400/10", icon: Tag },
  assign: { ring: "ring-amber-400/30", bg: "bg-amber-400/10", icon: UserPlus2 },
  webhook: { ring: "ring-fuchsia-400/30", bg: "bg-fuchsia-400/10", icon: Webhook },
  wait: { ring: "ring-zinc-400/30", bg: "bg-zinc-400/10", icon: Clock },
  condition: { ring: "ring-[color:var(--xyra-pink)]/40", bg: "bg-[color:var(--xyra-pink)]/10", icon: GitBranch },
  neutral: { ring: "ring-white/15", bg: "bg-white/5", icon: CircleDot },
};

const KIND_ICON: Record<string, typeof Zap> = {
  trigger: Zap,
  send_dm: MessageSquare,
  tag_contact: Tag,
  assign_agent: UserPlus2,
  assign_smart: UserPlus2,
  webhook: Webhook,
  wait: Clock,
  wait_for_reply: Reply,
  condition: GitBranch,
  ai_branch: Sparkles,
};

function FlowNodeCard({ data }: NodeProps) {
  const d = data as FlowNodeData & { selected?: boolean };
  const tone = TONE[d.tone] ?? TONE.neutral;
  const Icon = KIND_ICON[d.kind] ?? tone.icon;
  return (
    <div
      className={`w-[200px] rounded-xl bg-card/90 px-3 py-2.5 text-left shadow-lg ${
        d.selected ? "ring-2 ring-[color:var(--xyra-glow)]" : `ring-1 ${tone.ring}`
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/30" />
      <div className="flex items-center gap-2">
        <span className={`inline-flex size-6 items-center justify-center rounded-md ${tone.bg}`}>
          <Icon className="size-3.5 text-white/90" />
        </span>
        <span className="text-xs font-semibold text-white">{d.title}</span>
      </div>
      {d.subtitle && (
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/55">
          {d.subtitle}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-white/30" />
    </div>
  );
}

const nodeTypes = { flowNode: FlowNodeCard };

// Maps a flow node id back to its top-level action index (branch-leaf nodes
// resolve to their parent condition). Returns null for the trigger.
function actionIndexOf(id: string): number | null {
  const m = id.match(/^a(\d+)/);
  return m ? Number(m[1]) : null;
}

export function FlowCanvas({
  triggerLabel,
  actions,
  onSelect,
  selectedActionIndex,
  className,
}: {
  triggerLabel: string;
  actions: Action[];
  // When provided, nodes become clickable to select the corresponding step.
  onSelect?: (actionIndex: number | null) => void;
  selectedActionIndex?: number | null;
  className?: string;
}) {
  const { nodes, edges } = useMemo(() => {
    const f = buildFlow(triggerLabel, actions);
    return {
      nodes: f.nodes.map((n) => ({
        ...n,
        data: { ...n.data, selected: actionIndexOf(n.id) === selectedActionIndex },
      })) as unknown as Node[],
      edges: f.edges.map((e) => ({
        ...e,
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: "rgba(255,255,255,0.4)",
        },
        style: { stroke: "rgba(255,255,255,0.22)", strokeWidth: 1.5 },
        labelStyle: { fill: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "rgba(20,10,30,0.95)" },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 5,
      })) as unknown as Edge[],
    };
  }, [triggerLabel, actions, selectedActionIndex]);

  return (
    <div
      className={
        className ??
        "h-[460px] w-full overflow-hidden rounded-lg border border-white/10 bg-[color:var(--xyra-bg)]"
      }
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={!!onSelect}
        onNodeClick={onSelect ? (_, node) => onSelect(actionIndexOf(node.id)) : undefined}
        proOptions={{ hideAttribution: false }}
        minZoom={0.2}
      >
        <Background color="rgba(255,255,255,0.06)" gap={20} />
        <Controls showInteractive={false} className="!bg-card/80 !shadow-lg" />
      </ReactFlow>
    </div>
  );
}
