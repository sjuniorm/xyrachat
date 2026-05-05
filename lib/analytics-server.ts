import "server-only";
import { PostHog as PostHogServer } from "posthog-node";
import type { AnalyticsEvent } from "@/lib/analytics";

export const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let serverClient: PostHogServer | null = null;

function getServerClient() {
  if (serverClient) return serverClient;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  serverClient = new PostHogServer(key, {
    host: POSTHOG_HOST,
    flushAt: 1, // Serverless — flush per call, then shutdown.
    flushInterval: 0,
  });
  return serverClient;
}

export async function trackServer(
  event: AnalyticsEvent,
  distinctId: string,
  props: Record<string, unknown> = {},
) {
  const client = getServerClient();
  if (!client) return;
  client.capture({ event, distinctId, properties: props });
  await client.shutdown();
  serverClient = null;
}
