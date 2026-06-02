// Minimal mirror of the web app's WhatsApp template shapes (lib/templates/
// types.ts) — only what the mobile picker needs to list, preview, and send.

export type TemplateComponent = {
  type: string; // HEADER | BODY | FOOTER | BUTTONS (Meta's uppercase)
  text?: string;
  format?: string;
};

export type WaTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  components: TemplateComponent[];
  meta_status: string;
};

/** The BODY component text (the part with {{N}} placeholders). */
export function templateBody(t: WaTemplate): string {
  const body = (t.components ?? []).find(
    (c) => (c.type ?? "").toUpperCase() === "BODY",
  );
  return body?.text ?? "";
}

/** Highest {{N}} index in a body string (Meta numbers sequentially from 1). */
export function countVariables(text: string): number {
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g) ?? [];
  let max = 0;
  for (const m of matches) {
    const n = parseInt(m.replace(/[^\d]/g, ""), 10);
    if (n > max) max = n;
  }
  return max;
}

/** Substitute {{1}}, {{2}}… for preview. */
export function applyVariables(text: string, values: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const idx = parseInt(n, 10) - 1;
    return values[idx]?.trim() ? values[idx] : `{{${n}}}`;
  });
}

/**
 * Build the send-time `components` array Meta expects (lowercase `body` with
 * positional text parameters). Empty when the template has no body variables.
 */
export function buildSendComponents(
  values: string[],
): Array<Record<string, unknown>> {
  if (values.length === 0) return [];
  return [
    {
      type: "body",
      parameters: values.map((v) => ({ type: "text", text: v })),
    },
  ];
}
