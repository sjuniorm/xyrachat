import "server-only";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

// Supported upload types for bot knowledge. Kept small + text-only — we embed
// extracted text, not the binary. Office binary .doc (not .docx) is NOT
// supported (mammoth only reads the OOXML .docx format).
export const ACCEPTED_DOC_EXTENSIONS = ["pdf", "docx", "txt", "md"] as const;
export const ACCEPTED_DOC_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

// Bound the EXTRACTED output even when the compressed upload is small — a
// zip-bomb DOCX or a PDF with huge text streams can balloon far past the 4 MB
// upload cap. We cap pages (PDF) + truncate the resulting text so we never
// store / embed gigabytes.
const MAX_TEXT_CHARS = 1_000_000; // ~250k tokens; well past any real KB doc
const MAX_PDF_PAGES = 1000;

function extOf(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
}

function cap(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

export function isAcceptedDocument(filename: string, mime: string): boolean {
  const ext = extOf(filename);
  return (
    (ACCEPTED_DOC_EXTENSIONS as readonly string[]).includes(ext) ||
    ACCEPTED_DOC_MIMES.includes(mime)
  );
}

// Extract plain text from an uploaded document. Throws on unsupported type or
// when nothing readable comes out (e.g. a scanned/image-only PDF).
export async function extractDocumentText(
  buf: ArrayBuffer,
  mime: string,
  filename: string,
): Promise<string> {
  const ext = extOf(filename);

  if (mime === "application/pdf" || ext === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const pages = (pdf as { numPages?: number }).numPages ?? 0;
    if (pages > MAX_PDF_PAGES) {
      throw new Error(`PDF too large (${pages} pages, max ${MAX_PDF_PAGES}). Split it first.`);
    }
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : text;
    return cap(joined.trim());
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return cap(value.trim());
  }

  if (mime.startsWith("text/") || ext === "txt" || ext === "md") {
    return cap(new TextDecoder().decode(buf).trim());
  }

  throw new Error("Unsupported file type — upload a PDF, DOCX, TXT, or MD file.");
}
