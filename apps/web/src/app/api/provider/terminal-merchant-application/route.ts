import type { NextRequest } from "next/server";
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
import { getOrCreateDraftApplication } from "@/lib/terminal-merchant/gate";
import {
  buildTerminalMerchantPrefill,
  sanitizeApplicationForProvider,
} from "@/lib/terminal-merchant/prefill-and-validation";
import { TERMINAL_MERCHANT_VENDOR } from "@/lib/terminal-merchant/types";

/**
 * GET /api/provider/terminal-merchant-application
 * Returns current application + prefill + documents.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const { data: prov } = await admin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tenantId = (prov as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) return errorResponse("Tenant not found", "TENANT_NOT_FOUND", 404);

    const url = new URL(request.url);
    const shouldCreate = url.searchParams.get("create") !== "false";

    let application = null as Awaited<ReturnType<typeof getOrCreateDraftApplication>> | null;
    const { data: existing } = await admin
      .from("terminal_merchant_applications")
      .select("*")
      .eq("provider_id", providerId)
      .eq("vendor_slug", TERMINAL_MERCHANT_VENDOR)
      .not("status", "in", '("approved","declined","cancelled")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      application = existing as typeof application;
    } else if (shouldCreate) {
      application = await getOrCreateDraftApplication(admin, providerId, tenantId);
    }

    const prefill = await buildTerminalMerchantPrefill(admin, providerId, user.id);

    const { data: documents } = application
      ? await admin
          .from("terminal_merchant_application_documents")
          .select("*")
          .eq("application_id", application.id)
          .order("created_at", { ascending: true })
      : { data: [] };

    const { data: linkedOrders } = await admin
      .from("terminal_orders")
      .select("id, commercial_model, order_status, fulfillment_status, integration_setup_status")
      .eq("provider_id", providerId)
      .eq("integration_setup_status", "awaiting_merchant_onboarding");

    return successResponse({
      application: application ? sanitizeApplicationForProvider(application) : null,
      prefill,
      documents: documents ?? [],
      linked_orders: linkedOrders ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch terminal merchant application");
  }
}

const patchSchema = z.object({
  section: z.enum(["personal", "business", "address", "banking", "fulfillment"]).optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  id_type: z.enum(["national_id", "passport", "foreign_id"]).optional(),
  id_number: z.string().optional(),
  otp_phone: z.string().optional(),
  entity_type: z
    .enum([
      "sole_proprietor",
      "private_company",
      "close_corporation",
      "partnership",
      "trust",
      "npo",
      "other",
    ])
    .optional(),
  legal_name: z.string().optional(),
  trading_name: z.string().optional(),
  registration_number: z.string().optional(),
  vat_number: z.string().optional(),
  mcc: z.string().optional(),
  physical_line1: z.string().optional(),
  physical_suburb: z.string().optional(),
  physical_city: z.string().optional(),
  physical_province: z.string().optional(),
  physical_postal_code: z.string().optional(),
  physical_country: z.string().optional(),
  postal_same_as_physical: z.boolean().optional(),
  postal_line1: z.string().optional(),
  postal_suburb: z.string().optional(),
  postal_city: z.string().optional(),
  postal_province: z.string().optional(),
  postal_postal_code: z.string().optional(),
  postal_country: z.string().optional(),
  bank_code: z.string().optional(),
  bank_name: z.string().optional(),
  account_type: z.enum(["cheque_current", "savings", "transmission"]).optional(),
  account_holder: z.string().optional(),
  account_number: z.string().min(8).max(20).optional(),
  fulfillment_method: z.enum(["delivery", "collection"]).optional(),
  delivery_line1: z.string().optional(),
  delivery_suburb: z.string().optional(),
  delivery_city: z.string().optional(),
  delivery_province: z.string().optional(),
  delivery_postal_code: z.string().optional(),
  delivery_country: z.string().optional(),
  collection_location_id: z.string().uuid().nullable().optional(),
});

/**
 * PATCH /api/provider/terminal-merchant-application
 * Autosave draft sections.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const { data: prov } = await admin.from("providers").select("tenant_id").eq("id", providerId).maybeSingle();
    const tenantId = (prov as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) return errorResponse("Tenant not found", "TENANT_NOT_FOUND", 404);

    const application = await getOrCreateDraftApplication(admin, providerId, tenantId);
    if (!["draft", "info_required"].includes(application.status)) {
      return errorResponse("Application cannot be edited in current status", "INVALID_STATUS", 400);
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const data = parsed.data;

    for (const key of Object.keys(data)) {
      if (key === "section" || key === "account_number") continue;
      if (data[key as keyof typeof data] !== undefined) {
        update[key] = data[key as keyof typeof data];
      }
    }

    if (data.account_number) {
      const { encryptAccountNumber } = await import("@/lib/terminal-merchant/events");
      const { encrypted, last4 } = encryptAccountNumber(data.account_number);
      update.account_number_encrypted = encrypted;
      update.account_number_last4 = last4;
    }

    const { data: updated, error } = await admin
      .from("terminal_merchant_applications")
      .update(update)
      .eq("id", application.id)
      .select("*")
      .single();

    if (error) throw error;

    const { logTerminalMerchantApplicationEvent } = await import("@/lib/terminal-merchant/events");
    await logTerminalMerchantApplicationEvent(admin, {
      applicationId: application.id,
      eventType: "provider_autosave",
      actorUserId: user.id,
      actorRole: user.role ?? "provider_owner",
      message: data.section ? `Updated ${data.section}` : "Updated application",
      payload: { section: data.section ?? null },
    });

    return successResponse({ application: sanitizeApplicationForProvider(updated as any) });
  } catch (error) {
    return handleApiError(error, "Failed to update terminal merchant application");
  }
}

/**
 * POST /api/provider/terminal-merchant-application
 * Create draft explicitly (optional — GET also creates).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const { data: prov } = await admin.from("providers").select("tenant_id").eq("id", providerId).maybeSingle();
    const tenantId = (prov as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) return errorResponse("Tenant not found", "TENANT_NOT_FOUND", 404);

    const application = await getOrCreateDraftApplication(admin, providerId, tenantId, TERMINAL_MERCHANT_VENDOR);
    const prefill = await buildTerminalMerchantPrefill(admin, providerId, user.id);

    return successResponse(
      { application: sanitizeApplicationForProvider(application), prefill },
      application.created_at === application.updated_at ? 201 : 200,
    );
  } catch (error) {
    return handleApiError(error, "Failed to create terminal merchant application");
  }
}
