import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AuditLogEntry = {
  actor_user_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, any>;
};

export async function writeAuditLog(entry: AuditLogEntry) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("audit_logs").insert({
    actor_user_id: entry.actor_user_id ?? null,
    actor_role: entry.actor_role ?? null,
    action: entry.action,
    entity_type: entry.entity_type ?? null,
    entity_id: entry.entity_id ?? null,
    metadata: entry.metadata ?? {},
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to write audit log:", error);
  }
}

