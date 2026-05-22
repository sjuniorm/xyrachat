import "server-only";
import * as cheerio from "cheerio";

// Fetch a URL and return its body as clean text suitable for embedding.
// Drops nav/footer/script/style noise. Keeps headings + paragraph text
// because that's what an LLM actually needs to answer questions.
//
// Hard-caps body size at ~1MB so a hostile URL can't memory-bomb the
// process. Network timeout is 10s.
export async function scrapeUrl(url: string): Promise<{
  title: string;
  text: string;
  description: string | null;
}> {
  const u = new URL(url); // throws on invalid input
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Only http(s) URLs are supported");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let html: string;
  try {
    const res = await fetch(u.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "XyraChat/1.0 (+https://xyrachat.com; knowledge ingestion bot)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      throw new Error(`Fetch failed: HTTP ${res.status}`);
    }
    const reader = await res.text();
    html = reader.slice(0, 1_000_000); // 1MB cap
  } finally {
    clearTimeout(timer);
  }

  const $ = cheerio.load(html);

  // Strip noise.
  $("script, style, noscript, iframe, svg, nav, footer, header, aside, form").remove();
  $("[role=navigation], [aria-hidden=true]").remove();

  const title = ($("meta[property='og:title']").attr("content") ||
    $("title").text() ||
    "").trim();
  const description =
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content") ||
    null;

  // Prefer main / article if present; fall back to body.
  const root =
    $("main").first().length > 0
      ? $("main").first()
      : $("article").first().length > 0
        ? $("article").first()
        : $("body");

  // Walk headings + paragraphs + list items in document order. Anything
  // else (divs, spans) is included only as fallback to catch SPA-heavy
  // pages that don't use semantic tags.
  const pieces: string[] = [];
  root
    .find("h1, h2, h3, h4, p, li, blockquote")
    .each((_, el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (t.length >= 4) pieces.push(t);
    });

  // Fallback for SPA / div-heavy pages.
  if (pieces.length < 5) {
    pieces.length = 0;
    root.find("div").each((_, el) => {
      const direct = $(el).clone().children().remove().end().text();
      const t = direct.replace(/\s+/g, " ").trim();
      if (t.length >= 20) pieces.push(t);
    });
  }

  const text = pieces.join("\n\n").trim();
  if (!text) {
    throw new Error("No extractable text on that page");
  }

  return { title: title || u.hostname, text, description };
}
