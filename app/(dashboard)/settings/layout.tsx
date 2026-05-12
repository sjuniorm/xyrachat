import Link from "next/link";
import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="border-b border-white/5 px-4 md:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-1 py-2">
          <Link
            href="/dashboard"
            className="rounded px-2 py-1 text-xs text-white/40 hover:text-white"
          >
            ← Dashboard
          </Link>
          <SettingsNav />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
