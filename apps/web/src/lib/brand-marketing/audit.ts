import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  writeAuditLog,
  extractRequestMeta,
  computeChangedFields,
  type AuditRiskLevel,
  type AuditRetentionTier,
} from "@/lib/audit/audit";

export async function auditBrand(
  request: NextRequest | null,
  input: {
    supabase: SupabaseClient;
    tenantId: string;
    actorId: string;
    actorRole?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    risk: AuditRiskLevel;
    retention: AuditRetentionTier;
    reason?: string | null;
    campaignId?: string | null;
    briefId?: string | null;
    body?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  const reqMeta = extractRequestMeta(request ?? undefined);
  await writeAuditLog({
    actor_user_id: input.actorId,
    actor_role: input.actorRole ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    module: "brand",
    risk_level: input.risk,
    retention_tier: input.retention,
    reason: input.reason ?? null,
    before_json: input.before ?? null,
    after_json: input.after ?? null,
    changed_fields: computeChangedFields(input.before ?? null, input.after ?? null),
    metadata: input.meta,
    ...reqMeta,
  });

  await input.supabase.from("brand_activity").insert({
    tenant_id: input.tenantId,
    campaign_id: input.campaignId ?? null,
    brief_id: input.briefId ?? null,
    actor_id: input.actorId,
    kind: input.action,
    body: input.body ?? input.action,
    meta: {
      entity_type: input.entityType,
      entity_id: input.entityId,
      reason: input.reason ?? null,
      ...(input.meta ?? {}),
    },
  });
}

export { extractRequestMeta };
