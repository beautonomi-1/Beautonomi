import { NextRequest, NextResponse } from "next/server";
import {
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { parseReceiptDownloadToken } from "@/lib/receipts/receipt-download-token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { generateMarketingCreditReceiptPdf } from "@/lib/receipts/marketing-credit-receipt-pdf";

export const maxDuration = 60;

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
        kind: "provider_marketing_credit_receipt",
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
      const permissionCheck = await requirePermission("manage_finance", request);
      if (!permissionCheck.authorized) return permissionCheck.response!;
      providerId = await getProviderIdForUser(permissionCheck.user!.id, supabase);
    }
    if (!providerId) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const result = await generateMarketingCreditReceiptPdf({
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
      error instanceof Error ? error.message : "Failed to generate marketing credit receipt PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
