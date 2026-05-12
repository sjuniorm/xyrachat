"use client";

import { useMemo, useState } from "react";
import { Search, Smile } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmojiCategory = {
  label: string;
  emojis: { char: string; name: string }[];
};

const CATEGORIES: EmojiCategory[] = [
  {
    label: "Smileys",
    emojis: [
      { char: "😀", name: "grinning" },
      { char: "😃", name: "smile" },
      { char: "😄", name: "smile big" },
      { char: "😁", name: "beaming" },
      { char: "😆", name: "laugh" },
      { char: "😅", name: "sweat smile" },
      { char: "🤣", name: "rofl" },
      { char: "😂", name: "joy tears" },
      { char: "🙂", name: "slight smile" },
      { char: "🙃", name: "upside down" },
      { char: "😉", name: "wink" },
      { char: "😊", name: "blush" },
      { char: "😇", name: "halo" },
      { char: "🥰", name: "smile hearts" },
      { char: "😍", name: "heart eyes" },
      { char: "🤩", name: "star struck" },
      { char: "😘", name: "kiss" },
      { char: "😗", name: "kiss face" },
      { char: "😋", name: "yum" },
      { char: "😛", name: "tongue" },
      { char: "🤔", name: "thinking" },
      { char: "🤨", name: "raised brow" },
      { char: "😐", name: "neutral" },
      { char: "😶", name: "no mouth" },
      { char: "🙄", name: "eye roll" },
      { char: "😏", name: "smirk" },
      { char: "😒", name: "unamused" },
      { char: "😞", name: "disappointed" },
      { char: "😔", name: "pensive" },
      { char: "😟", name: "worried" },
      { char: "😕", name: "confused" },
      { char: "😢", name: "cry" },
      { char: "😭", name: "loudly cry" },
      { char: "😡", name: "angry pout" },
      { char: "😠", name: "angry" },
      { char: "🤯", name: "mind blown" },
      { char: "😱", name: "scream" },
      { char: "😨", name: "fearful" },
      { char: "😰", name: "anxious sweat" },
      { char: "😴", name: "sleeping" },
    ],
  },
  {
    label: "Gestures",
    emojis: [
      { char: "👍", name: "thumbs up" },
      { char: "👎", name: "thumbs down" },
      { char: "👌", name: "ok hand" },
      { char: "🤌", name: "pinched fingers" },
      { char: "✌️", name: "victory" },
      { char: "🤞", name: "fingers crossed" },
      { char: "🤝", name: "handshake" },
      { char: "🙏", name: "pray" },
      { char: "👏", name: "clap" },
      { char: "💪", name: "muscle" },
      { char: "🙌", name: "raise hands" },
      { char: "👋", name: "wave" },
      { char: "✋", name: "raised hand" },
      { char: "🤚", name: "back hand" },
      { char: "👇", name: "point down" },
      { char: "👆", name: "point up" },
      { char: "👈", name: "point left" },
      { char: "👉", name: "point right" },
    ],
  },
  {
    label: "Hearts",
    emojis: [
      { char: "❤️", name: "red heart" },
      { char: "🧡", name: "orange heart" },
      { char: "💛", name: "yellow heart" },
      { char: "💚", name: "green heart" },
      { char: "💙", name: "blue heart" },
      { char: "💜", name: "purple heart" },
      { char: "🖤", name: "black heart" },
      { char: "🤍", name: "white heart" },
      { char: "💖", name: "sparkling heart" },
      { char: "💗", name: "growing heart" },
      { char: "💝", name: "ribbon heart" },
      { char: "💔", name: "broken heart" },
      { char: "❣️", name: "exclamation heart" },
      { char: "💕", name: "two hearts" },
      { char: "💓", name: "beating heart" },
      { char: "💞", name: "revolving hearts" },
    ],
  },
  {
    label: "Common",
    emojis: [
      { char: "🔥", name: "fire" },
      { char: "✨", name: "sparkles" },
      { char: "⭐", name: "star" },
      { char: "🌟", name: "glow star" },
      { char: "💫", name: "dizzy star" },
      { char: "🎉", name: "party popper" },
      { char: "🎊", name: "confetti" },
      { char: "🎁", name: "gift" },
      { char: "🚀", name: "rocket" },
      { char: "💡", name: "bulb" },
      { char: "✅", name: "check" },
      { char: "❌", name: "cross" },
      { char: "⚠️", name: "warning" },
      { char: "❓", name: "question" },
      { char: "❗", name: "exclamation" },
      { char: "💯", name: "100" },
      { char: "💬", name: "speech" },
      { char: "📞", name: "phone" },
      { char: "📧", name: "email" },
      { char: "📦", name: "package" },
      { char: "💰", name: "money bag" },
      { char: "💳", name: "credit card" },
      { char: "🕐", name: "clock" },
      { char: "📅", name: "calendar" },
    ],
  },
];

const ALL_EMOJIS = CATEGORIES.flatMap((c) => c.emojis);

export function EmojiPicker({
  onSelect,
  disabled,
}: {
  onSelect: (char: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    const matches = ALL_EMOJIS.filter((e) => e.name.includes(q));
    return matches.length === 0
      ? []
      : [{ label: `Results (${matches.length})`, emojis: matches }];
  }, [query]);

  function pick(char: string) {
    onSelect(char);
    // Keep popover open so users can drop a couple of emojis in a row.
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="size-8 text-white/60 hover:text-white"
          aria-label="Emoji"
          title="Emoji"
        >
          <Smile className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={12}
        className="w-[min(20rem,calc(100vw-24px))] border-white/10 p-2"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji"
            className="h-8 border-white/10 bg-white/5 pl-8 text-xs text-white placeholder:text-white/40 focus-visible:border-[color:var(--xyra-glow)]"
          />
        </div>

        <div className="mt-2 max-h-64 overflow-y-auto pr-1">
          {filteredCategories.length === 0 ? (
            <p className="py-6 text-center text-xs text-white/50">
              No emoji matches “{query}”.
            </p>
          ) : (
            filteredCategories.map((cat) => (
              <section key={cat.label} className="mb-3 last:mb-0">
                <h4 className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-white/40">
                  {cat.label}
                </h4>
                <div className="grid grid-cols-8 gap-0.5">
                  {cat.emojis.map((e) => (
                    <button
                      key={e.char + e.name}
                      type="button"
                      onClick={() => pick(e.char)}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded text-lg leading-none transition",
                        "hover:bg-white/10 focus:bg-white/10 focus:outline-none",
                      )}
                      aria-label={e.name}
                      title={e.name}
                    >
                      {e.char}
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
