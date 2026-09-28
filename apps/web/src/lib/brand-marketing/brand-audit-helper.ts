import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditBrand } from "./audit";
import type { AuditRetentionTier, AuditRiskLevel } from "@/lib/audit/audit";

type BrandAccess = {
  tenantId: string | null;
  user: { id: string; role?: string | null };
};

export async function auditBrandMutation(
  request: NextRequest,
  supabase: SupabaseClient,
  access: BrandAccess,
  opts: {
    action: string;
    entityType: string;
    entityId: string;
    risk: AuditRiskLevel;
    retention: AuditRetentionTier;
    reason?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    campaignId?: string | null;
    briefId?: string | null;
    body?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  if (!access.tenantId) return;
  await auditBrand(request, {
    supabase,
    tenantId: access.tenantId,
    actorId: access.user.id,
    actorRole: access.user.role,
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId,
    risk: opts.risk,
    retention: opts.retention,
    reason: opts.reason ?? null,
    before: opts.before,
    after: opts.after,
    campaignId: opts.campaignId,
    briefId: opts.briefId,
    body: opts.body,
    meta: opts.meta,
  });
}
