import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  handleApiError,
  requireRoleInApi,
  unauthorizedResponse,
} from "@/lib/supabase/api-helpers";
import {
  generateProviderInvoice,
  ProviderInvoiceGenerationError,
} from "@/lib/invoices/generate-provider-invoice";

/**
 * POST /api/provider/invoices/generate
 * Generate invoice for platform fees (superadmin only)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);

    if (!user) {
      return unauthorizedResponse("Superadmin access required");
    }

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { providerId, periodStart, periodEnd, invoiceType = "platform_fee" } = body;

    const { invoice } = await generateProviderInvoice(supabase, {
      providerId,
      periodStart,
      periodEnd,
      invoiceType,
      createdBy: user.id,
      generatedBy: "admin",
    });

    return successResponse(invoice);
  } catch (error) {
    if (error instanceof ProviderInvoiceGenerationError) {
      return handleApiError(
        error,
        error.message,
        error.code,
        error.code === "NOT_FOUND" ? 404 : 400,
      );
    }
    return handleApiError(error, "Failed to generate invoice");
  }
}
