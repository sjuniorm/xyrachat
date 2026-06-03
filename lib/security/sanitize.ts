import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Sanitize inbound email HTML before we STORE it (messages.metadata.email.
 * html_body). The raw HTML comes from untrusted senders via the Resend
 * webhook; storing it unsanitized is a stored-XSS landmine for any current or
 * future client that renders it (the web UI, the public API consumers, an
 * export opened in a browser). We sanitize at the boundary so the stored value
 * is always safe.
 *
 * Strips <script>, event handlers (on*), <iframe>/<object>, and javascript:
 * URLs while keeping ordinary email formatting (links, images, lists, tables).
 */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "span",
      "hr",
      "u",
    ]),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      "*": ["class"],
    },
    // No javascript:/data: — only safe link/image schemes.
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
}
