"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Root error boundary — catches errors thrown in the root layout itself, so it
// must render its own <html>/<body> (it replaces everything). Inline styles
// because the normal stylesheet/layout chain is bypassed here. Reports to
// Sentry (inert until NEXT_PUBLIC_SENTRY_DSN is set).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#0B0418",
          color: "#fff",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 400 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#A89BB8", margin: "0 0 20px", lineHeight: 1.5 }}>
            An unexpected error occurred. Our team has been notified.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#9333EA",
              color: "#fff",
              border: 0,
              borderRadius: 10,
              padding: "10px 22px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
