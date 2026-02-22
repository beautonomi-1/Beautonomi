/**
 * Write config change audit entries (before/after) for control plane.
 * Server-only.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ConfigChangeArea = "flags" | "integration" | "module" | "ai_template";

export async function writeConfigChangeLog(params: {
  changedBy: string;
  area: ConfigChangeArea;
  recordKey: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("config_change_log").insert({
    changed_by: params.changedBy,
    area: params.area,
    record_key: params.recordKey,
    before_state: params.before,
    after_state: params.after,
  });
  if (error) {
    console.error("Failed to write config_change_log:", error);
  }
}
