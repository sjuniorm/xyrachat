import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PostHogProvider } from "@/components/posthog-provider";
import { CookieBanner } from "@/components/consent/cookie-banner";
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

export const metadata: Metadata = {
  title: "Xyra Chat — One inbox for every customer conversation",
  description:
    "Xyra Chat unifies WhatsApp, Instagram, Messenger and live chat into one inbox with automations, bots and broadcasts.",
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
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-background text-foreground">
        <PostHogProvider>
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
