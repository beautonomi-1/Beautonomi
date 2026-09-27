import { NextRequest } from "next/server";
import { handleApiError, requireGrcPermission } from "@/lib/supabase/api-helpers";
import { writeGrcActivity } from "@/lib/grc/activity";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { grcConflict, grcFromDbError, grcNotFound } from "@/lib/grc/errors";
import { GRC_EVIDENCE_BUCKET } from "@/lib/grc/evidence";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await requireGrcPermission("grc.audit_packs.generate", request);
    const { data: pack, error } = await auth.supabase.from("grc_audit_packs").select("*").eq("id", id).maybeSingle();
    if (error) throw grcFromDbError(error);
    if (!pack) throw grcNotFound("Audit pack not found");
    if (pack.status !== "ready" || !pack.storage_path) throw grcConflict("Audit pack is not ready yet");

    const admin = getSupabaseAdmin();
    const { data: blob, error: dlErr } = await admin.storage.from(GRC_EVIDENCE_BUCKET).download(pack.storage_path);
    if (dlErr || !blob) throw new Error(dlErr?.message ?? "Download failed");

    const { error: logErr } = await admin.from("grc_audit_pack_downloads").insert({ audit_pack_id: id, downloaded_by: auth.user.id });
    if (logErr) throw new Error(`Could not record download: ${logErr.message}`);
    await writeGrcActivity({
      actor_user_id: auth.user.id,
      action: "grc.audit_pack.downloaded",
      entity_type: "grc_audit_pack",
      entity_id: id,
      metadata: { manifest_hash: pack.manifest_hash },
    });

    const buffer = Buffer.from(await blob.arrayBuffer());
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="beautonomi-audit-pack-${id}.zip"`,
        "X-Manifest-Hash": pack.manifest_hash ?? "",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
