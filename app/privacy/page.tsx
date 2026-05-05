import Link from "next/link";
import { XyraWordmark } from "@/components/brand/xyra-wordmark";

export const metadata = { title: "Privacy Policy — Xyra Chat" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 prose prose-invert">
      <Link href="/" className="not-prose mb-8 inline-flex">
        <XyraWordmark size="sm" />
      </Link>
      <h1>Privacy Policy</h1>
      <p>
        <em>Placeholder — final legal text lands in Week 16. Last updated: 2026-05-05.</em>
      </p>
      <p>
        Xyra Chat (the &quot;Service&quot;) processes personal data on behalf of customers
        (data controllers) and on behalf of itself for product analytics. This page
        will be replaced with the production Privacy Policy before public launch.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: name, email, hashed password (via Supabase Auth).</li>
        <li>Organization data: workspace name, plan, billing identifier.</li>
        <li>Product analytics: anonymous usage events through PostHog (EU host).</li>
      </ul>
      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Access</strong> — download all data we hold about you at{" "}
          <code>/api/gdpr/export</code>.
        </li>
        <li>
          <strong>Erasure</strong> — soft-delete your account at{" "}
          <code>/api/gdpr/delete</code>.
        </li>
      </ul>
      <h2>Contact</h2>
      <p>privacy@xyrachat.com</p>
    </article>
  );
}
