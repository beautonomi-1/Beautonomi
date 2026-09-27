import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { grcBadRequest, grcFromDbError } from "@/lib/grc/errors";
import {
  GRC_EVIDENCE_BUCKET,
  GRC_EVIDENCE_MAX_BYTES,
  GRC_EVIDENCE_MIME_TYPES,
  SHA256_HEX,
  evidenceObjectPath,
  sha256Hex,
} from "@/lib/grc/evidence";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const schema = z.strictObject({
  control_id: z.string().min(1).max(40),
  sha256: z.string().regex(SHA256_HEX),
  title: z.string().trim().min(3, "Give the evidence a title").max(200),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum(GRC_EVIDENCE_MIME_TYPES),
  period_start: date.nullish(),
  period_end: date.nullish(),
  description: z.string().trim().max(5000).nullish(),
});

/**
 * Step 2 of evidence upload: verify the stored object's SHA-256 matches what the browser declared,
 * then record it. The row is inserted with the caller's session so RLS pins submitted_by, status
 * and source; the append-only trigger and hash-chained log take it from there.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await requireGrcPermission("grc.evidence.submit", request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      throw grcBadRequest(`${i?.path?.join(".") || "input"}: ${i?.message ?? "invalid"}`);
    }
    const input = parsed.data;
    if (input.period_start && input.period_end && input.period_end < input.period_start) {
      throw grcBadRequest("Period end must be on or after period start");
    }

    const path = evidenceObjectPath(input.control_id, input.sha256);
    const storage = getSupabaseAdmin().storage.from(GRC_EVIDENCE_BUCKET);
    const { data: blob, error: dlErr } = await storage.download(path);
    if (dlErr || !blob) throw grcBadRequest("Upload not found. Upload the file first, then submit.");
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.byteLength > GRC_EVIDENCE_MAX_BYTES) throw grcBadRequest("Files must be 50 MB or smaller");

    const actual = sha256Hex(bytes);
    if (actual !== input.sha256) {
      await storage.remove([path]);
      throw grcBadRequest("The uploaded file does not match its fingerprint. It was discarded; please upload again.");
    }

    const { data, error } = await supabase
      .from("grc_evidence")
      .insert({
        control_id: input.control_id,
        storage_path: path,
        content_sha256: actual,
        status: "submitted",
        source: "manual",
        submitted_by: user.id,
        title: input.title,
        file_name: input.file_name,
        mime_type: input.mime_type,
        size_bytes: bytes.byteLength,
        period_start: input.period_start ?? null,
        period_end: input.period_end ?? null,
        metadata: input.description ? { description: input.description } : {},
      })
      .select("id, control_id, content_sha256, created_at")
      .single();
    if (error) throw grcFromDbError(error);
    return successResponse({ item: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
