import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  is_paid: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/time-off-types
 * Get all time off types for provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: staffRows, error: staffErr } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("provider_id", providerId);
    if (staffErr) throw staffErr;

    const staffIds = (staffRows ?? []).map((s: { id: string }) => s.id);
    if (staffIds.length === 0) return successResponse([]);

    const { data: timeOffRows, error } = await supabase
      .from("staff_time_off")
      .select("type")
      .in("staff_id", staffIds);
    if (error) throw error;

    const names = [
      ...new Set(
        (timeOffRows ?? [])
          .map((r: { type?: string | null }) => String(r.type ?? "").trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));

    return successResponse(
      names.map((name) => ({
        id: name,
        name,
        description: null,
        is_paid: false,
        is_active: true,
      })),
    );
  } catch (error) {
    return handleApiError(error, "Failed to load time off types");
  }
}

/**
 * POST /api/provider/time-off-types
 * Create a new time off type
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const validationResult = createSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    return errorResponse(
      "Time-off types are labels on staff time-off records and cannot be created as a catalog.",
      "NOT_SUPPORTED",
      501,
    );
  } catch (error) {
    return handleApiError(error, "Failed to create time off type");
  }
}
