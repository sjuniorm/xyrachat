import { XyraWordmark } from "@/components/brand/xyra-wordmark";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* Glow halo behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 size-[480px] -translate-x-1/2 rounded-full opacity-30 blur-3xl xyra-gradient"
      />
      <Link href="/" className="relative mb-8 inline-flex">
        <XyraWordmark size="lg" variant="stacked" />
      </Link>
      <div className="relative w-full max-w-md">{children}</div>
      <p className="relative mt-8 text-xs text-muted-foreground">
        By continuing you agree to our{" "}
        <Link href="/terms" className="underline hover:text-foreground">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
