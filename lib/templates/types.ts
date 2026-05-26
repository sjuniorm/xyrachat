// WhatsApp template component shapes. Mirrors Meta's API exactly so we can
// POST `components` straight through during submission + receive them back
// during sync without re-mapping.
// Reference: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export type TemplateMetaStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "DISABLED"
  | "PAUSED"
  | "IN_APPEAL"
  | "LIMIT_EXCEEDED";

export type TemplateHeaderText = {
  type: "HEADER";
  format: "TEXT";
  text: string;
  example?: { header_text: string[] };
};

export type TemplateHeaderMedia = {
  type: "HEADER";
  format: "IMAGE" | "VIDEO" | "DOCUMENT";
  // Meta accepts a sample media handle here at submission time. We collect
  // it from the UI when present, otherwise omit and let Meta auto-approve
  // media headers without a sample (allowed for IMAGE only in some cases).
  example?: { header_handle: string[] };
};

export type TemplateBody = {
  type: "BODY";
  text: string;
  example?: { body_text: string[][] };
};

export type TemplateFooter = {
  type: "FOOTER";
  text: string;
};

export type TemplateButtonQuickReply = {
  type: "QUICK_REPLY";
  text: string;
};

export type TemplateButtonUrl = {
  type: "URL";
  text: string;
  url: string;
};

export type TemplateButtonPhone = {
  type: "PHONE_NUMBER";
  text: string;
  phone_number: string;
};

export type TemplateButton =
  | TemplateButtonQuickReply
  | TemplateButtonUrl
  | TemplateButtonPhone;

export type TemplateButtonsComponent = {
  type: "BUTTONS";
  buttons: TemplateButton[];
};

export type TemplateComponent =
  | TemplateHeaderText
  | TemplateHeaderMedia
  | TemplateBody
  | TemplateFooter
  | TemplateButtonsComponent;

export type WaTemplateRow = {
  id: string;
  org_id: string;
  channel_id: string | null;
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
  meta_template_id: string | null;
  meta_status: TemplateMetaStatus;
  meta_rejection_reason: string | null;
  example_values: Record<string, string[]>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

// Counts every {{N}} placeholder in a body string. Meta requires sequential
// numbering starting at 1.
export function countVariables(text: string): number {
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g) ?? [];
  let max = 0;
  for (const m of matches) {
    const n = parseInt(m.replace(/[^\d]/g, ""), 10);
    if (n > max) max = n;
  }
  return max;
}

// Substitute {{1}}, {{2}}, ... with the provided ordered values. Used for
// both live preview AND building per-recipient send payloads.
export function applyVariables(text: string, values: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const idx = parseInt(n, 10) - 1;
    return values[idx] ?? `{{${n}}}`;
  });
}

export function isValidTemplateName(name: string): boolean {
  // Meta: lowercase a-z, 0-9, underscore. <= 512 chars. We additionally cap
  // at 64 to keep the UI manageable.
  return /^[a-z0-9_]{1,64}$/.test(name);
}

export function normalizeTemplateName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}
