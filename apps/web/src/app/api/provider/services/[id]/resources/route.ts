import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/services/[id]/resources
 * List resource requirements for an offering (service).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_services", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const supabase = await getSupabaseServer(request);
    const { id: offeringId } = await params;

    const providerId = await getProviderIdForUser(permissionCheck.user!.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: offering } = await supabase
      .from("offerings")
      .select("id")
      .eq("id", offeringId)
      .eq("provider_id", providerId)
      .single();
    if (!offering) return notFoundResponse("Service not found");

    const { data: rows, error } = await supabase
      .from("offering_resources")
      .select("resource_id, required")
      .eq("offering_id", offeringId);

    if (error) throw error;

    return successResponse({
      resources: (rows || []).map((r: { resource_id: string; required: boolean }) => ({
        resource_id: r.resource_id,
        required: r.required,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch service resources");
  }
}

/**
 * PUT /api/provider/services/[id]/resources
 * Set resource requirements for an offering (replace existing).
 * Body: { resources: Array<{ resource_id: string, required: boolean }> }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_services", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const supabase = await getSupabaseServer(request);
    const { id: offeringId } = await params;

    const providerId = await getProviderIdForUser(permissionCheck.user!.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: offering } = await supabase
      .from("offerings")
      .select("id")
      .eq("id", offeringId)
      .eq("provider_id", providerId)
      .single();
    if (!offering) return notFoundResponse("Service not found");

    const body = await request.json();
    const raw = body?.resources;
    const resources = Array.isArray(raw)
      ? raw
          .filter(
            (r: any) =>
              r && typeof r.resource_id === "string" && typeof r.required === "boolean"
          )
          .map((r: any) => ({ resource_id: r.resource_id, required: r.required }))
      : [];

    const { error: deleteError } = await supabase
      .from("offering_resources")
      .delete()
      .eq("offering_id", offeringId);
    if (deleteError) throw deleteError;

    if (resources.length > 0) {
      const rows = resources.map((r: { resource_id: string; required: boolean }) => ({
        offering_id: offeringId,
        resource_id: r.resource_id,
        required: r.required,
      }));
      const { error: insertError } = await supabase
        .from("offering_resources")
        .insert(rows);
      if (insertError) throw insertError;
    }

    return successResponse({
      resources: resources.map((r: { resource_id: string; required: boolean }) => ({
        resource_id: r.resource_id,
        required: r.required,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to update service resources");
  }
}
