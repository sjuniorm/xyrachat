import Link from "next/link";
import { Users } from "lucide-react";

export default function ContactsPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full xyra-gradient">
          <Users className="size-6 text-white" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Contacts</h1>
        <p className="mt-2 text-sm text-white/60">
          Your unified address book — every customer that ever messaged you,
          with tags, notes and full conversation history.
        </p>
        <p className="mt-3 text-xs text-white/40">Coming soon.</p>
        <p className="mt-4 text-xs text-white/60">
          In the meantime, contact details are visible in the{" "}
          <Link href="/inbox" className="underline hover:text-white">
            inbox
          </Link>{" "}
          panel on the right of every conversation.
        </p>
      </div>
    </div>
  );
}
