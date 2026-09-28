import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeGrcActivity } from "@/lib/grc/activity";
import { buildAuditPack } from "./builder";

const STALE_BUILD_MS = 30 * 60_000;

/** Claims queued packs one at a time (status guard prevents double builds) and builds them. */
export async function processQueuedAuditPacks(admin: SupabaseClient, max = 2): Promise<{ built: string[]; failed: string[] }> {
  const staleBefore = new Date(Date.now() - STALE_BUILD_MS).toISOString();
  await admin
    .from("grc_audit_packs")
    .update({ status: "failed", error_message: "Build timed out; request a new pack" })
    .eq("status", "building")
    .lt("updated_at", staleBefore);

  const built: string[] = [];
  const failed: string[] = [];
  const { data: queued } = await admin.from("grc_audit_packs").select("id").eq("status", "queued").order("created_at").limit(max);
  for (const row of queued ?? []) {
    const { data: claimed } = await admin
      .from("grc_audit_packs")
      .update({ status: "building", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    try {
      const { manifestHash } = await buildAuditPack(admin, row.id);
      built.push(row.id);
      await writeGrcActivity({ actor_label: "grc-audit-packs", action: "grc.audit_pack.built", entity_type: "grc_audit_pack", entity_id: row.id, metadata: { manifest_hash: manifestHash } });
    } catch (e) {
      failed.push(row.id);
      const message = e instanceof Error ? e.message : "build failed";
      Sentry.captureException(e, { tags: { grc_audit_pack: row.id } });
      await admin.from("grc_audit_packs").update({ status: "failed", error_message: message.slice(0, 1000) }).eq("id", row.id);
      await writeGrcActivity({ actor_label: "grc-audit-packs", action: "grc.audit_pack.failed", entity_type: "grc_audit_pack", entity_id: row.id, metadata: { error: message.slice(0, 500) } });
    }
  }
  return { built, failed };
}
