import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PostHogProvider } from "@/components/posthog-provider";
import { CookieBanner } from "@/components/consent/cookie-banner";
import { ChunkReloader } from "@/components/chunk-reloader";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://app.xyrachat.com";
const SITE_TITLE = "Xyra Chat — One inbox for every customer conversation";
const SITE_DESC =
  "Xyra Chat unifies WhatsApp, Instagram, Messenger and live chat into one inbox with automations, bots and broadcasts.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESC,
  // Explicit PNG og:image — Facebook/Messenger don't render SVG link previews,
  // and an explicit tag clears the Sharing Debugger "inferred og:image" warning.
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESC,
    siteName: "Xyra Chat",
    images: [{ url: "/brand/logo.png", width: 1024, height: 1024, alt: "Xyra Chat" }],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ["/brand/logo.png"],
  },
};

const EEA_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL",
  "PT", "RO", "SK", "SI", "ES", "SE", "GB",
]);

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const country =
    h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? null;
  const showConsent = country ? EEA_COUNTRIES.has(country) : false;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-background text-foreground">
        <ChunkReloader />
        <PostHogProvider consentRequired={showConsent}>
          {children}
          <Toaster
            richColors
            theme="dark"
            position="top-center"
            mobileOffset={{ top: 12, left: 12, right: 12 }}
            // Clamp toast width to the viewport on phones (Sonner default is 356px).
            style={
              {
                "--width": "min(356px, calc(100vw - 24px))",
                "--mobile-width": "calc(100vw - 24px)",
              } as React.CSSProperties
            }
            toastOptions={{ classNames: { toast: "max-w-[calc(100vw-24px)]" } }}
          />
          {showConsent && <CookieBanner />}
        </PostHogProvider>
      </body>
    </html>
  );
}
