import "server-only";
import { lookup } from "dns/promises";

// SSRF protection for outbound webhook URLs. Reject any URL that:
//  - isn't http(s)
//  - resolves to a private / loopback / link-local / cloud-metadata range
//  - includes credentials in the URL
//
// We resolve DNS both at SUBSCRIBE time (block on creation) AND just
// before each DELIVERY (DNS-rebinding defense). The caller is expected
// to use `assertSafeOutboundUrl()` in both paths.

const BLOCKED_HOSTS = new Set([
  "localhost",
  "0.0.0.0",
]);

function isPrivateIp(ip: string): boolean {
  // IPv4 private + loopback + link-local + cloud metadata
  if (/^127\./.test(ip)) return true; // loopback
  if (/^10\./.test(ip)) return true; // RFC1918 A
  if (/^192\.168\./.test(ip)) return true; // RFC1918 C
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true; // RFC1918 B
  if (/^169\.254\./.test(ip)) return true; // link-local incl. AWS/Azure/GCP metadata 169.254.169.254
  if (/^0\./.test(ip)) return true; // 0.0.0.0/8
  if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(ip)) return true; // 100.64.0.0/10 CGNAT
  // IPv6 loopback + link-local + ULA
  if (ip === "::1") return true;
  if (/^fe80:/i.test(ip)) return true;
  if (/^fc/i.test(ip) || /^fd/i.test(ip)) return true;
  return false;
}

export async function assertSafeOutboundUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Webhook URL must use http:// or https://");
  }
  if (url.username || url.password) {
    throw new Error("Webhook URL must not include credentials.");
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    throw new Error("Webhook URL resolves to a blocked host.");
  }

  // If the host is already a literal IP, validate it directly.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host)) {
      throw new Error("Webhook URL resolves to a private IP.");
    }
    return url;
  }

  // DNS lookup — block if ANY resolved address is private.
  try {
    const records = await lookup(host, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error("Webhook URL resolves to a private IP.");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Webhook URL")) throw err;
    throw new Error("Could not resolve webhook host.");
  }

  return url;
}
