import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection,
  successResponse,
  notFoundResponse,
  handleApiError,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
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
