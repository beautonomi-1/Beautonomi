import { NextRequest } from "next/server";
import {
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * POST /api/provider/invoices/[id]/pay
 * Bank transfer (EFT) claims are no longer accepted — invoices are paid via Paystack only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    return handleApiError(
      new Error("Bank transfer is not supported for invoice payment. Use Pay online instead."),
      "Bank transfer is not supported for invoice payment. Use Pay online instead.",
      "VALIDATION_ERROR",
      400,
    );
  } catch (error) {
    return handleApiError(error, "Failed to submit payment claim");
  }
}
