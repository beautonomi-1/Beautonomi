import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSectionAny,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE, ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  createTransferRecipient,
  deleteTransferRecipient,
} from "@/lib/payments/paystack-complete";
import { z } from "zod";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const adminCreateAccountSchema = z.object({
  bank_code: z.string().min(1),
  account_number: z.string().min(8).max(15),
  account_name: z.string().min(1),
  account_type: z.string().optional(),
  currency: z.string().min(1).default("ZAR"),
});

/**
 * GET /api/admin/providers/[id]/payout-accounts
 *
 * List a provider's payout accounts (bank accounts). Uses admin client to bypass RLS.
 * [id] can be provider UUID or slug (same as GET /api/admin/providers/[id]).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSectionAny(
      [ADMIN_SECTION_PROVIDERS_OPERATIONS, ADMIN_SECTION_FINANCE],
      request
    );
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id: idOrSlug } = await params;

    if (!idOrSlug) {
      return notFoundResponse("Provider ID required");
    }

    const byId = UUID_REGEX.test(idOrSlug);
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(byId ? "id" : "slug", idOrSlug)
      .maybeSingle();

    if (providerError) {
      throw providerError;
    }
    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    const providerId = (provider as { id: string }).id;

    const { data: accounts, error } = await supabase
      .from("provider_payout_accounts")
      .select("*")
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(accounts || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch payout accounts");
  }
}

/**
 * POST /api/admin/providers/[id]/payout-accounts
 *
 * Admin creates a bank account (Paystack transfer recipient) for a provider.
 * Mirrors provider-side POST at /api/provider/payout-accounts but uses admin auth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSectionAny(
      [ADMIN_SECTION_PROVIDERS_OPERATIONS, ADMIN_SECTION_FINANCE],
      request
    );
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id: idOrSlug } = await params;

    if (!idOrSlug) {
      return notFoundResponse("Provider ID required");
    }

    const byId = UUID_REGEX.test(idOrSlug);
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq(byId ? "id" : "slug", idOrSlug)
      .maybeSingle();

    if (providerError) throw providerError;
    if (!provider) return notFoundResponse("Provider not found");

    const providerId = (provider as { id: string }).id;

    const body = await request.json();
    const validation = adminCreateAccountSchema.safeParse(body);

    if (!validation.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validation.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      );
    }

    const { bank_code, account_number, account_name, account_type, currency } = validation.data;

    const paystackRecipient = await createTransferRecipient(
      {
        type: "nuban",
        name: account_name,
        account_number,
        bank_code,
        currency,
        description: `Admin-added payout account for ${account_name}`,
        metadata: { provider_id: providerId, added_by_admin: user.id },
      },
      { tenantId }
    );

    if (!paystackRecipient.data) {
      return errorResponse(
        paystackRecipient.message || "Failed to create Paystack transfer recipient",
        "PAYSTACK_ERROR",
        500
      );
    }

    const details = (paystackRecipient.data as any)?.details;
    const accountNumberLast4 = account_number.slice(-4);

    const { data: existingAccounts } = await supabase
      .from("provider_payout_accounts")
      .select("id")
      .eq("provider_id", providerId)
      .is("deleted_at", null);
    const isFirstAccount = !existingAccounts?.length;

    const { data: savedAccount, error: saveError } = await supabase
      .from("provider_payout_accounts")
      .insert({
        provider_id: providerId,
        recipient_code: paystackRecipient.data.recipient_code,
        recipient_id: paystackRecipient.data.id ?? null,
        type: account_type || paystackRecipient.data.type || "nuban",
        account_number_last4: accountNumberLast4,
        account_name: details?.account_name || account_name,
        bank_code: details?.bank_code || bank_code,
        bank_name: details?.bank_name ?? null,
        currency: paystackRecipient.data.currency || currency,
        active: paystackRecipient.data.active !== false,
        is_primary: isFirstAccount,
        metadata: {
          paystack_response: paystackRecipient.data,
          added_by_admin: user.id,
        },
      })
      .select()
      .single();

    if (saveError) {
      try {
        await deleteTransferRecipient(paystackRecipient.data.recipient_code, { tenantId });
      } catch (deleteError) {
        console.error("Failed to cleanup Paystack recipient:", deleteError);
      }
      throw saveError;
    }

    return successResponse(savedAccount);
  } catch (error) {
    return handleApiError(error, "Failed to add payout account");
  }
}
