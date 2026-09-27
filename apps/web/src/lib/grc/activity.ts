import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Append to the hash-chained GRC activity log. Authenticated users have no INSERT policy on
 * grc_activity_log (959), so this always writes with the service role. Workflow RPCs log inside
 * their own transaction; this is for API-level events (record edits, downloads, uploads, cron).
 */
export async function writeGrcActivity(input: {
  actor_user_id?: string | null;
  actor_label?: string | null;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from("grc_activity_log").insert({
    actor_user_id: input.actor_user_id ?? null,
    actor_label: input.actor_label ?? null,
    action: input.action,
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.error("[grc] activity log write failed", input.action, error.message);
    Sentry.captureException(new Error(`grc activity log write failed: ${error.message}`), {
      extra: { action: input.action, entity_type: input.entity_type, entity_id: input.entity_id },
    });
  }
}
