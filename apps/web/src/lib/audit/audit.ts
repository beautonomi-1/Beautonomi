import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AuditRiskLevel = "low" | "medium" | "high" | "critical";
export type AuditStatus = "attempted" | "succeeded" | "failed";
export type AuditRetentionTier =
  | "permanent"
  | "financial"
  | "access"
  | "operational"
  | "routine"
  | "low";

const RETENTION_DAYS: Record<AuditRetentionTier, number | null> = {
  permanent: null,
  financial: 2555, // ~7 years
  access: 1825, // ~5 years
  operational: 1095, // ~3 years
  routine: 365,
  low: 90,
};

export type AuditLogEntry = {
  actor_user_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, any>;
  module?: string | null;
  risk_level?: AuditRiskLevel;
  status?: AuditStatus;
  reason?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  before_json?: Record<string, any> | null;
  after_json?: Record<string, any> | null;
  changed_fields?: string[] | null;
  retention_tier?: AuditRetentionTier;
  superadmin_bypass_used?: boolean;
};

/**
 * Extract IP address from a request when available.
 * Checks x-forwarded-for (Vercel/proxy) then x-real-ip.
 */
export function extractRequestMeta(request?: Request | null): {
  ip_address: string | null;
  user_agent: string | null;
} {
  if (!request) return { ip_address: null, user_agent: null };
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : request.headers.get("x-real-ip");
  return {
    ip_address: ip || null,
    user_agent: request.headers.get("user-agent")?.slice(0, 512) || null,
  };
}

/**
 * Compute changed fields between two objects (shallow comparison).
 */
export function computeChangedFields(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
): string[] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key);
    }
  }
  return changed;
}

/**
 * Redact sensitive fields from an object before storing in audit log.
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "new_password",
  "secret",
  "api_key",
  "secret_key",
  "access_token",
  "refresh_token",
  "two_factor_secret",
  "pin",
  "cvv",
  "card_number",
]);

function redactSensitive(obj: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!obj) return null;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function writeAuditLog(entry: AuditLogEntry) {
  const supabase = getSupabaseAdmin();

  const tier = entry.retention_tier ?? "routine";
  const retentionDays = RETENTION_DAYS[tier];
  const purgeAfter = retentionDays
    ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const beforeRedacted = redactSensitive(entry.before_json);
  const afterRedacted = redactSensitive(entry.after_json);
  const changedFields =
    entry.changed_fields ?? computeChangedFields(entry.before_json, entry.after_json);

  const { error } = await supabase.from("audit_logs").insert({
    actor_user_id: entry.actor_user_id ?? null,
    actor_role: entry.actor_role ?? null,
    action: entry.action,
    entity_type: entry.entity_type ?? null,
    entity_id: entry.entity_id ?? null,
    metadata: entry.metadata ?? {},
    module: entry.module ?? null,
    risk_level: entry.risk_level ?? "medium",
    status: entry.status ?? "succeeded",
    reason: entry.reason ?? null,
    ip_address: entry.ip_address ?? null,
    user_agent: entry.user_agent ?? null,
    before_json: beforeRedacted,
    after_json: afterRedacted,
    changed_fields: changedFields.length > 0 ? changedFields : null,
    retention_tier: tier,
    purge_after_at: purgeAfter,
    superadmin_bypass_used: entry.superadmin_bypass_used ?? false,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("Failed to write audit log:", error);
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(new Error(`Audit log write failed: ${error.message}`), {
        extra: { entry, dbError: error },
      });
    } catch {
      // Sentry not available
    }
  }
}

