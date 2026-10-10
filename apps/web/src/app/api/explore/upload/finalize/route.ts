import { NextRequest } from "next/server";
import { z } from "zod";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import {
  assertExplorePathOwnedByProvider,
  requireProviderExploreUploadAccess,
} from "@/lib/explore/explore-upload-access";
import { finalizeExploreImageFromStorage } from "@/lib/explore/finalize-explore-image";

export const maxDuration = 60;

const bodySchema = z.object({
  path: z.string().min(1),
});

/**
 * POST /api/explore/upload/finalize — Sharp display JPEG after signed image PUT.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireProviderExploreUploadAccess(request);
    if ("error" in auth && auth.error) return auth.error;
    const { providerId, supabaseAdmin } = auth;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", "VALIDATION_ERROR", 400);
    }

    const path = parsed.data.path.replace(/^\//, "");
    if (!assertExplorePathOwnedByProvider(path, providerId)) {
      return errorResponse("Invalid media path", "VALIDATION_ERROR", 400);
    }

    const result = await finalizeExploreImageFromStorage(supabaseAdmin, providerId, path);
    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to finalize image upload");
  }
}
