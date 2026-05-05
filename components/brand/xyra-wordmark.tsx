import { cn } from "@/lib/utils";

export function XyraWordmark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
  } as const;

  return (
    <span
      className={cn(
        "font-semibold tracking-tight xyra-gradient-text",
        sizes[size],
        className,
      )}
    >
      Xyra Chat
    </span>
  );
}
