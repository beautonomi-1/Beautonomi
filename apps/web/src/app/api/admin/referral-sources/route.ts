import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchProviderInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { z } from "zod";

const createSchema = z.object({
  provider_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/referral-sources?provider_id=
 * List referral sources for a provider in the current admin tenant (superadmin + ops roles).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const providerId = new URL(request.url).searchParams.get("provider_id")?.trim();

    if (!providerId) {
      return errorResponse("provider_id query parameter is required", "VALIDATION_ERROR", 400);
    }

    const prov = await fetchProviderInAdminTenant(supabase, providerId, tenantId, "id");
    if ("error" in prov) return prov.error;

    const { data, error } = await supabase
      .from("referral_sources")
      .select("*")
      .eq("provider_id", providerId)
      .order("name", { ascending: true });

    if (error) throw error;
    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to load referral sources");
  }
}

/**
 * POST /api/admin/referral-sources
 * Create a referral source for a provider in the admin tenant.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = createSchema.parse(await request.json());

    const prov = await fetchProviderInAdminTenant(supabase, body.provider_id, tenantId, "id");
    if ("error" in prov) return prov.error;

    const { data, error } = await supabase
      .from("referral_sources")
      .insert({
        provider_id: body.provider_id,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        is_active: body.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map((i) => i.message).join(", "), "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to create referral source");
  }
}
