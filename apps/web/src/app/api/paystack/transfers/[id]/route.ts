import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import {
  fetchTransfer,
  finalizeTransfer,
  verifyTransfer,
} from "@/lib/payments/paystack-complete";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";

/**
 * When a payout row links this Paystack transfer id/code, ensure provider is on the Host tenant.
 */
async function tenantGuardForTransfer(
  request: Request,
  tenantId: string,
  id: string,
): Promise<Response | null> {
  const supabase = await getSupabaseServer(request);
  const { data: p1 } = await supabase
    .from("payouts")
    .select("provider_id")
    .eq("transfer_code", id)
    .maybeSingle();
  let providerId = (p1 as { provider_id?: string } | null)?.provider_id;
  if (!providerId) {
    const { data: p2 } = await supabase
      .from("payouts")
      .select("provider_id")
      .eq("payout_provider_transaction_id", id)
      .maybeSingle();
    providerId = (p2 as { provider_id?: string } | null)?.provider_id;
  }
  if (!providerId && /^\d+$/.test(id)) {
    const { data: p3 } = await supabase
      .from("payouts")
      .select("provider_id")
      .eq("transfer_id", Number(id))
      .maybeSingle();
    providerId = (p3 as { provider_id?: string } | null)?.provider_id;
  }
  if (!providerId) return null;
  const { data: prov } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  if (
    !resourceTenantMatchesHostTenant(
      tenantId,
      (prov as { tenant_id?: string | null } | null)?.tenant_id,
    )
  ) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Transfer is not in this market.",
          code: "TENANT_MISMATCH",
        },
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * GET /api/paystack/transfers/[id]
 * Fetch transfer details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { id } = await params;
    const tenantBlock = await tenantGuardForTransfer(request, tenantId, id);
    if (tenantBlock) return tenantBlock;

    const response = await fetchTransfer(id, { tenantId });

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error fetching transfer:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to fetch transfer",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/paystack/transfers/[id]/finalize
 * Finalize transfer with OTP
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { id } = await params;
    const tenantBlock = await tenantGuardForTransfer(request, tenantId, id);
    if (tenantBlock) return tenantBlock;

    const body = await request.json();
    const { otp } = body;

    if (!otp) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "OTP is required",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const response = await finalizeTransfer(id, otp, { tenantId });

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error finalizing transfer:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to finalize transfer",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/paystack/transfers/[id]/verify
 * Verify transfer by reference
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { id } = await params;
    const tenantBlock = await tenantGuardForTransfer(request, tenantId, id);
    if (tenantBlock) return tenantBlock;

    const response = await verifyTransfer(id, { tenantId });

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error verifying transfer:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to verify transfer",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
