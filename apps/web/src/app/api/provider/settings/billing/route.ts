import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  formatPaymentMethodExpiry,
  isPaymentMethodExpired,
} from "@/lib/payments/payment-method-expiry";

/**
 * GET /api/provider/settings/billing
 * Get provider billing contact info (address, email, phone).
 * Payment methods and invoices have their own dedicated endpoints.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const { data: billingSettings, error } = await supabase
      .from("providers")
      .select("billing_address, billing_email, billing_phone")
      .eq("id", providerId)
      .maybeSingle();

    if (error) throw error;

    const [{ data: paymentMethods }, { data: invoices }] = await Promise.all([
      supabase
        .from("provider_payment_methods")
        .select("id, name, type, last4, expiry_month, expiry_year, is_default, is_active")
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .order("is_default", { ascending: false }),
      supabase
        .from("provider_invoices")
        .select(
          "id, invoice_number, status, invoice_type, total_amount, issue_date, due_date, paid_at"
        )
        .eq("provider_id", providerId)
        .order("issue_date", { ascending: false })
        .limit(25),
    ]);

    type ProviderPaymentMethodRow = {
      id: string;
      name: string | null;
      type: string | null;
      last4: string | null;
      expiry_month?: number | null;
      expiry_year?: number | null;
      is_default: boolean | null;
      is_active?: boolean | null;
    };

    const shapedPaymentMethods = (paymentMethods ?? []).map(
      (pm: ProviderPaymentMethodRow) => ({
        id: pm.id,
        name: pm.name,
        type: pm.type,
        last4: pm.last4 ?? undefined,
        expiry_month: pm.expiry_month ?? undefined,
        expiry_year: pm.expiry_year ?? undefined,
        expiry_label:
          formatPaymentMethodExpiry(pm.expiry_month, pm.expiry_year) ?? undefined,
        is_expired: isPaymentMethodExpired(pm.expiry_month, pm.expiry_year),
        is_default: !!pm.is_default,
      }),
    );

    return successResponse({
      billingAddress: billingSettings?.billing_address ?? null,
      billingEmail: billingSettings?.billing_email ?? null,
      billingPhone: billingSettings?.billing_phone ?? null,
      paymentMethods: shapedPaymentMethods,
      invoices: invoices ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load billing information");
  }
}

/**
 * PATCH /api/provider/settings/billing
 * Update provider billing information
 */
export async function PATCH(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const updates: any = {};

    if (body.billingAddress !== undefined) {
      updates.billing_address = body.billingAddress;
    }
    if (body.billingEmail !== undefined) {
      updates.billing_email = body.billingEmail;
    }
    if (body.billingPhone !== undefined) {
      updates.billing_phone = body.billingPhone;
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to update billing information");
  }
}
