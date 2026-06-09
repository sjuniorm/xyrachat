"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Globe, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addTextSource, addUrlSource, deleteSource } from "@/lib/bots/actions";
import type { KnowledgeSource } from "./page";

const STATUS_COLORS: Record<string, string> = {
  done: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300",
  running: "border-amber-400/30 bg-amber-400/15 text-amber-200",
  pending: "border-amber-400/30 bg-amber-400/15 text-amber-200",
  failed: "border-rose-400/30 bg-rose-400/15 text-rose-300",
};

export function KnowledgeTab({
  botId,
  sources,
}: {
  botId: string;
  sources: KnowledgeSource[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"text" | "url" | null>(null);
  const [pending, startTransition] = useTransition();

  // Text-source state
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  // URL-source state
  const [urlValue, setUrlValue] = useState("");

  // Auto-refresh while any source is still embedding, so the status badge
  // settles to done/failed without the agent clicking "Refresh". Polls the
  // server component (router.refresh re-fetches `sources`) every 2.5s and
  // stops as soon as nothing is processing. bot_sources isn't in the realtime
  // publication, so a short poll-while-processing is the lightest path.
  const processing = sources.some(
    (s) => s.embedding_status === "pending" || s.embedding_status === "running",
  );
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [processing, router]);

  function onAddText() {
    if (!textTitle.trim()) return toast.error("Title required.");
    if (textContent.trim().length < 20) return toast.error("Content too short.");
    startTransition(async () => {
      const r = await addTextSource(botId, textTitle, textContent);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Knowledge added.");
      setTextTitle("");
      setTextContent("");
      setMode(null);
      router.refresh();
    });
  }

  function onAddUrl() {
    if (!urlValue.trim()) return toast.error("URL required.");
    startTransition(async () => {
      const r = await addUrlSource(botId, urlValue.trim());
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("URL indexed.");
      setUrlValue("");
      setMode(null);
      router.refresh();
    });
  }

  function onDelete(sourceId: string) {
    if (!confirm("Remove this source? The bot will lose access to its content.")) return;
    startTransition(async () => {
      const r = await deleteSource(sourceId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Source removed.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="border-white/10"
          onClick={() => setMode(mode === "text" ? null : "text")}
        >
          <FileText className="mr-1.5 size-4" />
          Paste text
        </Button>
        <Button
          variant="outline"
          className="border-white/10"
          onClick={() => setMode(mode === "url" ? null : "url")}
        >
          <Globe className="mr-1.5 size-4" />
          Add URL
        </Button>
        <Button
          variant="outline"
          disabled
          className="border-white/10 opacity-50"
          title="File upload coming soon — paste text or use a URL for now"
        >
          <Upload className="mr-1.5 size-4" />
          Upload file (soon)
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.refresh()}
          className="ml-auto h-8 text-white/60 hover:text-white"
        >
          <RefreshCw className={`mr-1.5 size-3.5 ${processing ? "animate-spin" : ""}`} />
          {processing ? "Updating…" : "Refresh status"}
        </Button>
      </div>

      {mode === "text" && (
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Add text knowledge</CardTitle>
            <CardDescription>
              Paste any text — FAQs, policies, product info. We chunk it and
              embed it automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="kb-title">Title</Label>
              <Input
                id="kb-title"
                placeholder="e.g. Pricing FAQ"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-content">Content</Label>
              <Textarea
                id="kb-content"
                rows={8}
                placeholder="Paste the content here…"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="resize-y"
              />
              <p className="text-[11px] text-white/50">
                {textContent.length} characters
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMode(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                onClick={onAddText}
                disabled={pending}
                className="xyra-gradient text-white border-0 hover:opacity-90"
              >
                {pending ? "Embedding…" : "Add knowledge"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "url" && (
        <Card className="border-white/10 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Add URL</CardTitle>
            <CardDescription>
              We&apos;ll fetch the page, strip nav/footer noise, and embed the
              body content.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="kb-url">URL</Label>
              <Input
                id="kb-url"
                type="url"
                placeholder="https://example.com/about"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMode(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                onClick={onAddUrl}
                disabled={pending}
                className="xyra-gradient text-white border-0 hover:opacity-90"
              >
                {pending ? "Fetching + embedding…" : "Index URL"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-white/10 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Sources</CardTitle>
          <CardDescription>
            {sources.length === 0
              ? "No knowledge yet. Add some above so the bot has something to ground its answers in."
              : `${sources.length} source${sources.length === 1 ? "" : "s"} indexed.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-0">
          {sources.length === 0 ? null : (
            <ul className="divide-y divide-white/5">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-md bg-white/5">
                    {s.type === "url" ? (
                      <Globe className="size-4 text-white/60" />
                    ) : s.type === "document" ? (
                      <Upload className="size-4 text-white/60" />
                    ) : (
                      <FileText className="size-4 text-white/60" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {s.title ?? s.url ?? "Untitled"}
                    </p>
                    <p className="truncate text-xs text-white/50">
                      {s.type === "url" && s.url ? s.url : `Added ${new Date(s.created_at).toLocaleDateString()}`}
                      {s.embedding_status === "failed" && s.embedding_error && (
                        <span className="ml-2 text-rose-300">
                          · {s.embedding_error}
                        </span>
                      )}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`h-5 px-1.5 text-[10px] ${
                      STATUS_COLORS[s.embedding_status] ?? "border-white/15 bg-white/5"
                    }`}
                  >
                    {s.embedding_status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(s.id)}
                    className="h-8 text-white/60 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {sources.length === 0 && (
            <div className="px-5 pb-5">
              <Button
                onClick={() => setMode("text")}
                className="xyra-gradient text-white border-0 hover:opacity-90"
              >
                <Plus className="mr-1.5 size-4" />
                Add first knowledge source
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
