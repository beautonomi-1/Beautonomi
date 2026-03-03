import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const bodySchema = z.object({ version: z.number().int().optional() });

/**
 * POST /api/admin/service-zones/[id]/publish
 * Set zone status to 'active'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parse = bodySchema.safeParse(body);

    const { data: zone, error: fetchError } = await supabase
      .from("platform_zones")
      .select("id, status, version")
      .eq("id", id)
      .single();

    if (fetchError || !zone) return notFoundResponse("Zone not found");

    if (parse.data?.version != null && (zone as any).version !== parse.data.version) {
      return errorResponse("Version conflict; refresh and retry", "CONFLICT", 409);
    }

    const { data: updated, error: updateError } = await supabase
      .from("platform_zones")
      .update({
        status: "active",
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    return successResponse(updated);
  } catch (error) {
    return handleApiError(error, "Failed to publish zone");
  }
}
