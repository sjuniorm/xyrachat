import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found · Xyra Chat" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-semibold tracking-tight xyra-gradient-text">404</p>
      <h1 className="mt-3 text-xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-white/60">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Button
        asChild
        className="mt-6 xyra-gradient border-0 text-white hover:opacity-90"
      >
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
