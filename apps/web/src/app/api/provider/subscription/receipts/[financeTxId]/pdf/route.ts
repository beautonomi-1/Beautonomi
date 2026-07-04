import { NextRequest, NextResponse } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { generateSubscriptionReceiptPdf } from "@/lib/receipts/subscription-receipt-pdf";

export const maxDuration = 60;

/**
 * GET /api/provider/subscription/receipts/[financeTxId]/pdf
 *
 * Provider-facing PDF receipt for a subscription payment. Keyed on
 * `finance_transactions.id` so it covers BOTH one-off subscription orders and
 * recurring renewals (every recognized payment posts exactly one
 * `provider_subscription_payment` finance row via the unified helper).
 *
 * Dual auth (mirrors ads / product-order receipts):
 *   1. Short-lived `?token=` minted for the native app or emailed receipt link.
 *   2. Normal session (provider_owner / provider_staff / superadmin).
 * Access is always scoped to the caller's own provider; the shared renderer
 * enforces that the finance row belongs to `providerId`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ financeTxId: string }> },
) {
  try {
    const { financeTxId } = await params;
    const supabase = getSupabaseAdmin();

    const token = new URL(request.url).searchParams.get("token");
    let providerId: string | null = null;
    if (token) {
      const parsed = parseReceiptDownloadToken(token, {
        kind: "provider_subscription_receipt",
        subjectId: financeTxId,
      });
      if (!parsed) {
        return NextResponse.json(
          { error: "Signed download token is invalid or expired" },
          { status: 401 },
        );
      }
      providerId = await getProviderIdForUser(parsed.userId, supabase);
    } else {
      const { user } = await requireRoleInApi(
        ["provider_owner", "provider_staff", "superadmin"],
        request,
      );
      providerId = await getProviderIdForUser(user.id, supabase);
    }
    if (!providerId) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const result = await generateSubscriptionReceiptPdf({
      supabase,
      financeTxId,
      request,
      enforceProviderId: providerId,
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
    const message =
      error instanceof Error ? error.message : "Failed to generate subscription receipt PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
