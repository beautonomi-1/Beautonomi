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

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  is_paid: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

/**
 * PATCH /api/provider/time-off-types/[id]
 * Update a time off type
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const validationResult = updateSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    return errorResponse(
      "Time-off types are labels on staff time-off records and cannot be edited as a catalog.",
      "NOT_SUPPORTED",
      501,
    );
  } catch (error) {
    return handleApiError(error, "Failed to update time off type");
  }
}

/**
 * DELETE /api/provider/time-off-types/[id]
 * Delete a time off type
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    return errorResponse(
      "Time-off types are labels on staff time-off records and cannot be deleted as a catalog.",
      "NOT_SUPPORTED",
      501,
    );
  } catch (error) {
    return handleApiError(error, "Failed to delete time off type");
  }
}
