import { NextRequest } from "next/server";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { logTerminalMerchantApplicationEvent, encryptAccountNumber } from "@/lib/terminal-merchant/events";
import { decryptAccountNumberForExport } from "@/lib/terminal-merchant/events";

type RouteParams = { params: Promise<{ id: string }> };

import { requireTerminalMerchantAdmin } from "@/lib/terminal-merchant/admin-auth";

/**
 * GET /api/admin/terminal-merchant-applications/[id]
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireTerminalMerchantAdmin(_request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(_request);

    const { data: application, error } = await supabase
      .from("terminal_merchant_applications")
      .select(
        `*,
         providers(id, business_name, slug, phone, email, user_id),
         paycloud_merchants(id, merchant_no, store_no, label),
         terminal_orders(id, commercial_model, order_status, fulfillment_status, integration_setup_status, invoice_status)`,
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!application) return errorResponse("Application not found", "NOT_FOUND", 404);

    const [{ data: documents }, { data: events }] = await Promise.all([
      supabase
        .from("terminal_merchant_application_documents")
        .select("*")
        .eq("application_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("terminal_merchant_application_events")
        .select("*")
        .eq("application_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    return successResponse({
      application: {
        ...application,
        account_number: decryptAccountNumberForExport(
          (application as { account_number_encrypted?: string }).account_number_encrypted,
        ),
      },
      documents: documents ?? [],
      events: events ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch terminal merchant application");
  }
}

/**
 * PATCH /api/admin/terminal-merchant-applications/[id]
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireTerminalMerchantAdmin(request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const { data: existing } = await supabase
      .from("terminal_merchant_applications")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return errorResponse("Application not found", "NOT_FOUND", 404);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = [
      "first_name", "last_name", "email", "phone", "id_type", "id_number", "otp_phone",
      "entity_type", "legal_name", "trading_name", "registration_number", "vat_number", "mcc",
      "physical_line1", "physical_suburb", "physical_city", "physical_province", "physical_postal_code", "physical_country",
      "postal_same_as_physical", "postal_line1", "postal_suburb", "postal_city", "postal_province", "postal_postal_code", "postal_country",
      "bank_code", "bank_name", "account_type", "account_holder",
      "fulfillment_method", "delivery_line1", "delivery_suburb", "delivery_city", "delivery_province", "delivery_postal_code", "delivery_country",
      "collection_location_id", "assigned_admin_id", "acquirer_reference",
      "section_personal_verified", "section_business_verified", "section_address_verified",
      "section_banking_verified", "section_documents_verified", "section_fulfillment_verified",
      "support_ticket_id",
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key];
    }
    if (body.account_number) {
      const { encrypted, last4 } = encryptAccountNumber(String(body.account_number));
      update.account_number_encrypted = encrypted;
      update.account_number_last4 = last4;
    }

    const { data: updated, error } = await supabase
      .from("terminal_merchant_applications")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await logTerminalMerchantApplicationEvent(supabase, {
      applicationId: id,
      eventType: "staff_edit",
      actorUserId: user.id,
      actorRole: user.role ?? "admin",
      message: "Application updated by staff",
      payload: { fields: Object.keys(body) },
    });

    return successResponse({ application: updated });
  } catch (error) {
    return handleApiError(error, "Failed to update terminal merchant application");
  }
}
