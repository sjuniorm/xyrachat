import "server-only";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

// Brand palette (mirrors app/globals.css). Email clients want inline styles +
// web-safe fallbacks, so we use plain hex + a system font stack — no gradients
// or external CSS (unreliable across Gmail/Outlook).
const c = {
  bg: "#0B0418",
  card: "#1F1033",
  text: "#FFFFFF",
  muted: "#A89BB8",
  glow: "#D882FF",
  purple: "#9333EA",
  border: "rgba(255,255,255,0.08)",
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: c.bg,
          margin: 0,
          padding: "32px 12px",
          fontFamily: FONT,
        }}
      >
        <Container
          style={{
            maxWidth: 480,
            margin: "0 auto",
            backgroundColor: c.card,
            borderRadius: 16,
            border: `1px solid ${c.border}`,
            overflow: "hidden",
          }}
        >
          <Section style={{ padding: "24px 32px 0" }}>
            <Text style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              <span style={{ color: c.glow }}>Xyra</span>
              <span style={{ color: c.text }}> Chat</span>
            </Text>
          </Section>
          <Section style={{ padding: "8px 32px 24px" }}>{children}</Section>
          <Hr style={{ borderColor: c.border, margin: 0 }} />
          <Section style={{ padding: "16px 32px 24px" }}>
            <Text
              style={{ margin: 0, fontSize: 12, color: c.muted, lineHeight: "18px" }}
            >
              You&apos;re receiving this because you have a Xyra Chat account.
              Need help? Email{" "}
              <Link href="mailto:support@xyrachat.com" style={{ color: c.glow }}>
                support@xyrachat.com
              </Link>
              .
            </Text>
            <Text style={{ margin: "8px 0 0", fontSize: 11, color: c.muted }}>
              © Xyra Chat · xyrachat.com
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        color: c.text,
        fontSize: 22,
        fontWeight: 700,
        margin: "8px 0 12px",
        lineHeight: "28px",
      }}
    >
      {children}
    </Heading>
  );
}

export function EmailText({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{ color: c.muted, fontSize: 15, lineHeight: "23px", margin: "0 0 16px" }}
    >
      {children}
    </Text>
  );
}

export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: c.purple,
        color: c.text,
        fontSize: 15,
        fontWeight: 600,
        textDecoration: "none",
        padding: "11px 22px",
        borderRadius: 10,
      }}
    >
      {children}
    </Button>
  );
}

export const emailColors = c;
