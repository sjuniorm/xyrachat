import { Users } from "lucide-react";

export default function ContactsPage() {
  return (
    <ComingSoon
      icon={<Users className="size-6 text-white" />}
      title="Contacts"
      blurb="Your unified address book — every customer that ever messaged you, with tags, notes and history."
      ships="Week 5"
    />
  );
}

function ComingSoon({
  icon,
  title,
  blurb,
  ships,
}: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  ships: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full xyra-gradient">
          {icon}
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-sm text-white/60">{blurb}</p>
        <p className="mt-3 text-xs text-white/40">Ships {ships}.</p>
      </div>
    </div>
  );
}
