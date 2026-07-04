import { NextRequest, NextResponse } from "next/server";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateSubscriptionReceiptPdf } from "@/lib/receipts/subscription-receipt-pdf";

export const maxDuration = 60;

/**
 * GET /api/admin/provider-subscriptions/receipts/[financeTxId]/pdf
 *
 * Admin (finance) copy of a provider's subscription-payment receipt. Keyed on
 * `finance_transactions.id`, identical to the provider-facing receipt but with
 * admin auth and NO provider-ownership check, so superadmins/finance admins can
 * pull any provider's subscription receipt from the admin console.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ financeTxId: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { financeTxId } = await params;
    const supabase = getSupabaseAdmin();

    const result = await generateSubscriptionReceiptPdf({
      supabase,
      financeTxId,
      request,
      // No ownership enforcement — admin finance can view any provider's receipt.
      enforceProviderId: null,
    });
    if (result.kind === "ok") {
      return new NextResponse(new Uint8Array(result.buffer), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${result.filename}"`,
          "cache-control": "private, no-store",
        },
      });
    }

    return NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    return handleApiError(error, "Failed to generate subscription receipt PDF");
  }
}
