import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { grcBadRequest, grcFromDbError, grcNotFound } from "@/lib/grc/errors";
import {
  GRC_EVIDENCE_BUCKET,
  GRC_EVIDENCE_MAX_BYTES,
  GRC_EVIDENCE_MIME_TYPES,
  SHA256_HEX,
  evidenceObjectPath,
} from "@/lib/grc/evidence";

const schema = z.strictObject({
  control_id: z.string().min(1).max(40),
  sha256: z.string().regex(SHA256_HEX, "sha256 must be 64 lowercase hex characters"),
  size_bytes: z.number().int().min(1).max(GRC_EVIDENCE_MAX_BYTES, "Files must be 50 MB or smaller"),
  mime_type: z.enum(GRC_EVIDENCE_MIME_TYPES, { message: "That file type is not accepted as evidence" }),
});

/**
 * Step 1 of evidence upload: the browser hashes the file, then uploads it straight to storage with
 * this signed URL (Vercel caps request bodies at 4.5 MB). Step 2 is POST /api/admin/grc/evidence,
 * which re-hashes the stored object before recording it.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireGrcPermission("grc.evidence.submit", request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw grcBadRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const { control_id, sha256 } = parsed.data;

    const { data: control, error: cErr } = await supabase.from("grc_controls").select("id").eq("id", control_id).maybeSingle();
    if (cErr) throw grcFromDbError(cErr);
    if (!control) throw grcNotFound("Control not found");

    const path = evidenceObjectPath(control_id, sha256);
    const storage = getSupabaseAdmin().storage.from(GRC_EVIDENCE_BUCKET);
    const folder = path.slice(0, path.lastIndexOf("/"));
    const { data: existing } = await storage.list(folder, { search: sha256, limit: 1 });
    if (existing?.some((o) => o.name === sha256)) {
      return successResponse({ path, exists: true, signed_url: null, token: null });
    }

    const { data, error } = await storage.createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "Could not create upload URL");
    return successResponse({ path, exists: false, signed_url: data.signedUrl, token: data.token });
  } catch (error) {
    return handleApiError(error);
  }
}
