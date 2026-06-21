import { NextResponse } from "next/server";

// Coarse ceiling = largest per-channel media cap (25 MB) + multipart overhead.
// Used to reject an oversized upload by its Content-Length BEFORE the body is
// buffered into memory by req.formData() (the precise per-type cap is still
// enforced after parsing). Mirrors the readBytesCapped pre-check in
// lib/ai/provider-media.ts. /api/channels/* is middleware-exempt, so this is
// the first place we can bound the body.
export const MAX_UPLOAD_BYTES = 26 * 1024 * 1024;

export function rejectOversizeUpload(req: Request): NextResponse | null {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large." }, { status: 413 });
  }
  return null;
}
