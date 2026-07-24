import { NextRequest } from "next/server";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { ACTIONABLE_APPLICATION_STATUSES } from "@/lib/terminal-merchant/types";
import { requireTerminalMerchantAdmin } from "@/lib/terminal-merchant/admin-auth";

/**
 * GET /api/admin/terminal-merchant-applications
 */
export async function GET(request: NextRequest) {
  try {
    await requireTerminalMerchantAdmin(request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const assignee = url.searchParams.get("assignee");

    let query = supabase
      .from("terminal_merchant_applications")
      .select(
        `*,
         providers(id, business_name, slug, phone, email),
         terminal_orders(id, commercial_model, order_status, fulfillment_status, integration_setup_status)`,
      )
      .eq("tenant_id", tenantId)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (assignee === "unassigned") query = query.is("assigned_admin_id", null);
    else if (assignee) query = query.eq("assigned_admin_id", assignee);

    const { data, error } = await query.limit(200);
    if (error) throw error;

    const actionable = (data ?? []).filter((row) =>
      ACTIONABLE_APPLICATION_STATUSES.includes((row as { status: string }).status as any),
    ).length;

    return successResponse({ applications: data ?? [], actionable_count: actionable });
  } catch (error) {
    return handleApiError(error, "Failed to list terminal merchant applications");
  }
}

/**
 * POST /api/admin/terminal-merchant-applications
 * Create application on behalf of provider.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireTerminalMerchantAdmin(request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();
    const providerId = String(body.provider_id ?? "").trim();
    if (!providerId) {
      const { errorResponse } = await import("@/lib/supabase/api-helpers");
      return errorResponse("provider_id required", "VALIDATION_ERROR", 400);
    }

    const { getOrCreateDraftApplication } = await import("@/lib/terminal-merchant/gate");
    const application = await getOrCreateDraftApplication(supabase, providerId, tenantId);

    const { logTerminalMerchantApplicationEvent } = await import("@/lib/terminal-merchant/events");
    await logTerminalMerchantApplicationEvent(supabase, {
      applicationId: application.id,
      eventType: "created_by_staff",
      actorUserId: user.id,
      actorRole: user.role ?? "admin",
      message: "Application created by support",
    });

    return successResponse({ application }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create terminal merchant application");
  }
}
