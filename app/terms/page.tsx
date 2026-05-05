import Link from "next/link";
import { XyraWordmark } from "@/components/brand/xyra-wordmark";

export const metadata = { title: "Terms of Service — Xyra Chat" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 prose prose-invert">
      <Link href="/" className="not-prose mb-8 inline-flex">
        <XyraWordmark size="sm" />
      </Link>
      <h1>Terms of Service</h1>
      <p>
        <em>Placeholder — final legal text lands in Week 16. Last updated: 2026-05-05.</em>
      </p>
      <p>
        By using Xyra Chat you agree to use the Service in compliance with applicable
        law, the platform policies of the messaging providers you connect (WhatsApp
        Business, Meta, etc.), and these terms (when finalised).
      </p>
      <h2>Acceptable use</h2>
      <p>No spam, no abuse, no unlawful content. Customer-messaging platforms have
        strict policies and we enforce them.</p>
      <h2>Contact</h2>
      <p>legal@xyrachat.com</p>
    </article>
  );
}
