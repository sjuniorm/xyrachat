import Image from "next/image";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";
type Variant = "inline" | "stacked";

const ICON_PX: Record<Size, number> = { sm: 22, md: 32, lg: 44 };
const TEXT_CLASS: Record<Size, string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};
const STACKED_PX: Record<Size, number> = { sm: 96, md: 144, lg: 200 };

export function XyraWordmark({
  className,
  size = "md",
  variant = "inline",
}: {
  className?: string;
  size?: Size;
  variant?: Variant;
}) {
  if (variant === "stacked") {
    const px = STACKED_PX[size];
    return (
      <Image
        src="/brand/logo.svg"
        alt="Xyra Chat"
        width={px}
        height={px}
        unoptimized
        className={cn("xyra-glow-filter select-none", className)}
      />
    );
  }

  const iconPx = ICON_PX[size];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/brand/logo-mark.svg"
        alt=""
        width={iconPx}
        height={iconPx}
        unoptimized
        aria-hidden
        className="xyra-glow-filter select-none"
      />
      <span
        className={cn(
          "font-semibold tracking-tight xyra-gradient-text",
          TEXT_CLASS[size],
        )}
      >
        Xyra Chat
      </span>
    </span>
  );
}
