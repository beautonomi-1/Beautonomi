import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { requirePaycloudPlatformEnabledForProvider } from "@/lib/payments/paycloud-feature-gate";
import { getPaycloudNotifyUrl } from "@/lib/payments/paycloud-credentials";
import { initiatePaycloudRefund } from "@/lib/payments/initiate-paycloud-refund";
import { z } from "zod";

const refundBodySchema = z.object({
  amount: z.number().positive(),
  terminal_id: z.string().uuid().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json({ data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } }, { status: 404 });
    }
    const gate = await requirePaycloudPlatformEnabledForProvider(supabase, providerId);
    if (gate) return gate;

    const body = await request.json().catch(() => ({}));
    const parsed = refundBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: { message: "Validation failed", code: "VALIDATION_ERROR" } },
        { status: 400 },
      );
    }

    const result = await initiatePaycloudRefund({
      supabase,
      providerId,
      paymentId: id,
      amount: parsed.data.amount,
      processedBy: permissionCheck.user.id,
      notifyUrl: getPaycloudNotifyUrl(request),
      terminalId: parsed.data.terminal_id,
    });

    if (result.ok === false) {
      return NextResponse.json(
        { data: null, error: { message: result.message, code: result.code } },
        { status: result.status },
      );
    }

    return NextResponse.json({ data: result.refundPayment, error: null });
  } catch (error: unknown) {
    console.error("POST /api/provider/paycloud/payments/[id]/refund:", error);
    return NextResponse.json(
      { data: null, error: { message: "Failed to refund payment", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
