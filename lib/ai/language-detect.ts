import "server-only";
import { franc } from "franc";

// ISO 639-3 (what franc returns) → ISO 639-1 we use everywhere else.
// Cover the languages in TOP_LANGUAGES + a few common extras.
const ISO3_TO_ISO1: Record<string, string> = {
  eng: "en",
  spa: "es",
  fra: "fr",
  deu: "de",
  por: "pt",
  ita: "it",
  nld: "nl",
  cat: "ca",
  jpn: "ja",
  zho: "zh",
  cmn: "zh",
  rus: "ru",
  ara: "ar",
  pol: "pl",
  tur: "tr",
  ron: "ro",
  ukr: "uk",
  vie: "vi",
  ind: "id",
  swe: "sv",
  fin: "fi",
  dan: "da",
  nor: "no",
  ell: "el",
  ces: "cs",
};

export type DetectedLanguage = {
  iso: string | null;        // ISO 639-1, e.g. 'es'
  iso3: string | "und";      // franc's raw output
  confidence: number;        // 0..1 — franc's "trust" with our normalisation
};

// Detect the language of a short string. Short messages are tricky — franc
// is unreliable below ~20 chars. We surface a confidence so callers can
// decide whether to act (e.g. only auto-translate when confidence >= 0.7).
export function detectLanguage(text: string): DetectedLanguage {
  const trimmed = text.trim();
  if (!trimmed) return { iso: null, iso3: "und", confidence: 0 };

  const iso3 = franc(trimmed, { minLength: 8 });
  if (iso3 === "und") return { iso: null, iso3: "und", confidence: 0 };

  const iso = ISO3_TO_ISO1[iso3] ?? null;
  // Heuristic confidence: longer input = more confident. Bins instead of a
  // calibrated probability — good enough to gate "should we translate?"
  const len = trimmed.length;
  const confidence =
    len < 16 ? 0.4 : len < 40 ? 0.65 : len < 120 ? 0.85 : 0.95;
  return { iso, iso3, confidence };
}
