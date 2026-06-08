import "server-only";
import { lookup } from "dns/promises";
import { isIP } from "node:net";

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

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function isPrivateIpv4(ip: string): boolean {
  if (/^127\./.test(ip)) return true; // loopback
  if (/^10\./.test(ip)) return true; // RFC1918 A
  if (/^192\.168\./.test(ip)) return true; // RFC1918 C
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true; // RFC1918 B
  if (/^169\.254\./.test(ip)) return true; // link-local incl. cloud metadata 169.254.169.254
  if (/^0\./.test(ip)) return true; // 0.0.0.0/8
  if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(ip)) return true; // 100.64.0.0/10 CGNAT
  return false;
}

// Accepts a host that may be a bracketed IPv6 literal, a bare IPv6, or IPv4.
// Returns true for any loopback / private / link-local / metadata / IPv4-mapped
// address. (The previous version compared bracketed strings, so EVERY IPv6
// check was dead code — [::1] / [::ffff:169.254.169.254] all slipped through.)
function isPrivateIp(raw: string): boolean {
  const ip = stripBrackets(raw).toLowerCase();
  const fam = isIP(ip);
  if (fam === 4) return isPrivateIpv4(ip);
  if (fam === 6) {
    if (ip === "::1" || ip === "::") return true; // loopback / unspecified
    if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link-local
    if (/^f[cd]/.test(ip)) return true; // fc00::/7 ULA
    // IPv4-mapped: ::ffff:a.b.c.d (dotted) or ::ffff:hhhh:hhhh (hex) → check the
    // embedded IPv4 (e.g. ::ffff:169.254.169.254 → metadata).
    const dotted = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (dotted) return isPrivateIpv4(dotted[1]);
    const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIpv4(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
    }
    return false;
  }
  return false; // not an IP literal — the DNS-resolution path handles names
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

  // If the host is already a literal IP (incl. a bracketed IPv6), validate it
  // directly rather than going through DNS.
  if (isIP(stripBrackets(host)) !== 0) {
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
