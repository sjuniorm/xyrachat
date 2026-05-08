export type LanguageOption = { code: string; label: string };

export const TOP_LANGUAGES: LanguageOption[] = [
  { code: "es", label: "Spanish" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "ca", label: "Catalan" },
];

export function languageLabel(code: string | undefined | null): string {
  if (!code) return "the customer's language";
  const base = code.split("-")[0].toLowerCase();
  return (
    TOP_LANGUAGES.find((l) => l.code === base)?.label ??
    code.toUpperCase()
  );
}
