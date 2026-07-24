import { NextRequest } from "next/server";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { logTerminalMerchantApplicationEvent } from "@/lib/terminal-merchant/events";
import {
  notifyTerminalMerchantApplicationApproved,
} from "@/lib/terminal-merchant/notifications";
import { slackNotifyTerminalMerchantApproved } from "@/lib/integrations/slack/terminal-merchant-triggers";
import { ungateOrdersAfterApproval } from "@/lib/terminal-merchant/gate";

type RouteParams = { params: Promise<{ id: string }> };

import { requireTerminalMerchantAdmin } from "@/lib/terminal-merchant/admin-auth";

/**
 * POST /api/admin/terminal-merchant-applications/[id]/approve
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireTerminalMerchantAdmin(request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();
    const merchantNo = String(body.merchant_no ?? "").trim();
    const storeNo = String(body.store_no ?? "").trim();
    if (!merchantNo || !storeNo) {
      return errorResponse("merchant_no and store_no required", "VALIDATION_ERROR", 400);
    }

    const { data: application } = await supabase
      .from("terminal_merchant_applications")
      .select("*, providers(id, business_name, user_id, tenant_id)")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!application) return errorResponse("Application not found", "NOT_FOUND", 404);

    if (application.status === "approved" && application.paycloud_merchant_id) {
      return errorResponse("Application already approved", "ALREADY_APPROVED", 400);
    }

    const label =
      application.trading_name ??
      application.legal_name ??
      (application as { providers?: { business_name?: string } }).providers?.business_name ??
      "PayCloud merchant";

    const { data: merchant, error: merchantErr } = await supabase
      .from("paycloud_merchants")
      .insert({
        tenant_id: tenantId,
        label,
        merchant_no: merchantNo,
        store_no: storeNo,
        environment: "live",
        is_active: true,
        metadata: { terminal_merchant_application_id: id },
      })
      .select("*")
      .single();
    if (merchantErr) throw merchantErr;

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("terminal_merchant_applications")
      .update({
        status: "approved",
        approved_at: now,
        paycloud_merchant_id: merchant.id,
        updated_at: now,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await ungateOrdersAfterApproval(supabase, id);

    await logTerminalMerchantApplicationEvent(supabase, {
      applicationId: id,
      eventType: "approved",
      actorUserId: user.id,
      actorRole: user.role ?? "admin",
      message: `Approved — merchant ${merchantNo}/${storeNo}`,
      payload: { paycloud_merchant_id: merchant.id },
    });

    const provider = (application as { providers?: { business_name?: string; user_id?: string; tenant_id?: string } })
      .providers;
    if (provider?.user_id) {
      await notifyTerminalMerchantApplicationApproved({
        userId: provider.user_id,
        tenantId: provider.tenant_id,
        businessName: provider.business_name ?? "Provider",
        applicationNo: updated.application_no,
        applicationId: updated.id,
      });
    }
    await slackNotifyTerminalMerchantApproved(request, updated as any, provider);

    return successResponse({ application: updated, paycloud_merchant: merchant });
  } catch (error) {
    return handleApiError(error, "Failed to approve terminal merchant application");
  }
}
