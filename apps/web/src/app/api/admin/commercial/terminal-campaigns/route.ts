/**
 * GET  /api/admin/commercial/terminal-campaigns  — list campaigns
 * POST /api/admin/commercial/terminal-campaigns  — create + send a campaign
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  target_criteria: z.record(z.string(), z.unknown()).default({}),
  message_body: z.string().min(1).max(5000),
  cta_label: z.string().optional().nullable(),
  cta_url: z.string().url().optional().nullable(),
  media_url: z.string().url().optional().nullable(),
  announcement_type: z.string().default("promotion"),
  expires_at: z.string().datetime().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data, error, count } = await supabase
      .from("terminal_campaigns")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      return errorResponse("Failed to load campaigns", "LOAD_ERROR", 500, error);
    }

    return successResponse({ items: data ?? [], total: count ?? 0 });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal campaigns");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const flagEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.TERMINAL_CAMPAIGNS,
      tenantId,
    );
    if (!flagEnabled) {
      return errorResponse("Terminal campaigns are not enabled.", "FEATURE_DISABLED", 403);
    }

    const body = await request.json();
    const validation = createCampaignSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    // Resolve eligible recipients based on target_criteria
    const criteria = validation.data.target_criteria as Record<string, unknown>;
    let recipientQuery = supabase
      .from("provider_payment_terminal_profile")
      .select("provider_id, providers!inner(id, user_id, tenant_id)")
      .eq("providers.tenant_id", tenantId);

    if (criteria.terminal_ownership_status) {
      recipientQuery = recipientQuery.eq("terminal_ownership_status", String(criteria.terminal_ownership_status));
    }
    if (criteria.interested_in_platform_terminal) {
      recipientQuery = recipientQuery.eq("interested_in_platform_terminal", String(criteria.interested_in_platform_terminal));
    }
    if (criteria.terminal_provider) {
      recipientQuery = recipientQuery.eq("terminal_provider", String(criteria.terminal_provider));
    }

    const { data: recipients, error: recipientErr } = await recipientQuery;
    if (recipientErr) {
      return errorResponse("Failed to resolve campaign recipients", "RECIPIENT_ERROR", 500, recipientErr);
    }

    const eligibleRecipients = (recipients ?? []) as Array<{
      provider_id: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      providers: any;
    }>;

    // Create campaign record
    const { data: campaign, error: campaignErr } = await supabase
      .from("terminal_campaigns")
      .insert({
        tenant_id: tenantId,
        name: validation.data.name,
        description: validation.data.description ?? null,
        status: "sending",
        target_criteria: validation.data.target_criteria,
        announcement_type: validation.data.announcement_type,
        message_body: validation.data.message_body,
        cta_label: validation.data.cta_label ?? null,
        cta_url: validation.data.cta_url ?? null,
        media_url: validation.data.media_url ?? null,
        expires_at: validation.data.expires_at ?? null,
        recipient_count: eligibleRecipients.length,
        created_by: adminUser.id,
      })
      .select()
      .single();

    if (campaignErr) {
      return errorResponse("Failed to create campaign", "SAVE_ERROR", 500, campaignErr);
    }

    const campaignId = (campaign as { id?: string }).id ?? "";

    // Insert recipient tracking rows (opt-out respecting)
    if (eligibleRecipients.length > 0) {
      const recipientRows = eligibleRecipients.map((r) => ({
        campaign_id: campaignId,
        provider_id: r.provider_id,
        user_id: r.providers.user_id ?? r.provider_id,
      }));

      await supabase.from("terminal_campaign_recipients").insert(recipientRows);

      // Mark sent
      await supabase
        .from("terminal_campaigns")
        .update({ status: "sent", sent_count: eligibleRecipients.length, sent_at: new Date().toISOString() })
        .eq("id", campaignId);
    } else {
      await supabase.from("terminal_campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", campaignId);
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: "admin.terminal_campaign.created",
      entity_type: "terminal_campaigns",
      entity_id: campaignId,
      module: "terminal_commerce",
      after_json: campaign,
      metadata: { recipient_count: eligibleRecipients.length, criteria },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ campaign, recipient_count: eligibleRecipients.length }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create terminal campaign");
  }
}
