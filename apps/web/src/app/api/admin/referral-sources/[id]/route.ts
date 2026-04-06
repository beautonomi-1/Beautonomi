import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchProviderInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const { data: src, error: srcErr } = await supabase
      .from("referral_sources")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src?.provider_id) return notFoundResponse("Referral source not found");

    const prov = await fetchProviderInAdminTenant(supabase, src.provider_id, tenantId, "id");
    if ("error" in prov) return prov.error;

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.description !== undefined) update.description = body.description?.trim() || null;
    if (body.is_active !== undefined) update.is_active = body.is_active;

    const { data, error } = await supabase.from("referral_sources").update(update).eq("id", id).select().single();
    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map((i) => i.message).join(", "), "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to update referral source");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const { data: src, error: srcErr } = await supabase
      .from("referral_sources")
      .select("id, provider_id")
      .eq("id", id)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src?.provider_id) return notFoundResponse("Referral source not found");

    const prov = await fetchProviderInAdminTenant(supabase, src.provider_id, tenantId, "id");
    if ("error" in prov) return prov.error;

    const { error } = await supabase.from("referral_sources").delete().eq("id", id);
    if (error) throw error;
    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete referral source");
  }
}
