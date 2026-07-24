import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateApplicationForSubmit } from "@/lib/terminal-merchant/prefill-and-validation";
import { buildTerminalMerchantPrefill } from "@/lib/terminal-merchant/prefill-and-validation";
import { TERMINAL_MERCHANT_VENDOR } from "@/lib/terminal-merchant/types";
import { logTerminalMerchantApplicationEvent } from "@/lib/terminal-merchant/events";
import { notifyTerminalMerchantApplicationSubmitted } from "@/lib/terminal-merchant/notifications";
import { slackNotifyTerminalMerchantSubmitted } from "@/lib/integrations/slack/terminal-merchant-triggers";

/**
 * POST /api/provider/terminal-merchant-application/submit
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const { data: application } = await admin
      .from("terminal_merchant_applications")
      .select("*")
      .eq("provider_id", providerId)
      .eq("vendor_slug", TERMINAL_MERCHANT_VENDOR)
      .not("status", "in", '("approved","declined","cancelled")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!application) {
      return errorResponse("No application found", "NOT_FOUND", 404);
    }

    if (!["draft", "info_required"].includes(String(application.status))) {
      return errorResponse("Application already submitted", "INVALID_STATUS", 400);
    }

    const { data: documents } = await admin
      .from("terminal_merchant_application_documents")
      .select("doc_type, status")
      .eq("application_id", application.id);

    const prefill = await buildTerminalMerchantPrefill(admin, providerId, user.id);
    const issues = validateApplicationForSubmit(
      application as any,
      documents ?? [],
      prefill.identity_verified,
    );

    if (issues.length > 0) {
      return errorResponse("Application incomplete", "VALIDATION_ERROR", 400, { issues });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await admin
      .from("terminal_merchant_applications")
      .update({
        status: "submitted",
        submitted_at: now,
        info_required_sections: [],
        info_required_reason: null,
        updated_at: now,
      })
      .eq("id", application.id)
      .select("*")
      .single();

    if (error) throw error;

    await logTerminalMerchantApplicationEvent(admin, {
      applicationId: application.id,
      eventType: "submitted",
      actorUserId: user.id,
      actorRole: user.role ?? "provider_owner",
      message: "Application submitted by provider",
    });

    const { data: providerRow } = await admin
      .from("providers")
      .select("business_name, user_id, tenant_id")
      .eq("id", providerId)
      .maybeSingle();

    if (providerRow?.user_id) {
      await notifyTerminalMerchantApplicationSubmitted({
        userId: providerRow.user_id,
        tenantId: providerRow.tenant_id,
        businessName: providerRow.business_name ?? "Provider",
        applicationNo: updated.application_no,
        applicationId: updated.id,
      });
    }

    try {
      await slackNotifyTerminalMerchantSubmitted(request, updated as any, providerRow as any);
    } catch (slackErr) {
      console.error("Slack terminal merchant submitted failed:", slackErr);
    }

    const { sanitizeApplicationForProvider } = await import("@/lib/terminal-merchant/prefill-and-validation");
    return successResponse({ application: sanitizeApplicationForProvider(updated as any) });
  } catch (error) {
    return handleApiError(error, "Failed to submit terminal merchant application");
  }
}
