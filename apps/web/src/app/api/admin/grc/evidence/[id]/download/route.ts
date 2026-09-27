import { NextRequest } from "next/server";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeGrcActivity } from "@/lib/grc/activity";
import { grcFromDbError, grcNotFound } from "@/lib/grc/errors";
import { GRC_EVIDENCE_BUCKET } from "@/lib/grc/evidence";

/** Short-lived signed URL for one evidence object; every access is logged. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user, supabase } = await requireGrcPermission("grc.evidence.view", request);
    const { data: ev, error } = await supabase
      .from("grc_evidence")
      .select("id, control_id, storage_path, file_name, content_sha256")
      .eq("id", id)
      .maybeSingle();
    if (error) throw grcFromDbError(error);
    if (!ev || !ev.storage_path) throw grcNotFound("Evidence file not found");

    const { data, error: sErr } = await getSupabaseAdmin()
      .storage.from(GRC_EVIDENCE_BUCKET)
      .createSignedUrl(ev.storage_path, 60, { download: ev.file_name ?? true });
    if (sErr || !data) throw new Error(sErr?.message ?? "Could not sign download");

    await writeGrcActivity({
      actor_user_id: user.id,
      action: "grc.evidence.downloaded",
      entity_type: "grc_evidence",
      entity_id: id,
      metadata: { control_id: ev.control_id, sha256: ev.content_sha256 },
    });
    return successResponse({ url: data.signedUrl, sha256: ev.content_sha256, expires_in: 60 });
  } catch (error) {
    return handleApiError(error);
  }
}
