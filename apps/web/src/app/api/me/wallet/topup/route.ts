import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { convertToSmallestUnit } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const schema = z.object({
  amount: z.number().min(1, "Minimum top up amount is 1"),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const body = schema.parse(await request.json());

    const { data: userRow } = await supabase
      .from("users")
      .select("email, preferred_currency")
      .eq("id", user.id)
      .single();

    const email = (userRow as any)?.email;
    if (!email) throw new Error("User email is required");

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = tenantId ? await getTenantRegionConfig(tenantId) : null;
    const currency =
      (userRow as any)?.preferred_currency ||
      tenantRegion?.defaultCurrency ||
      LAST_RESORT_CURRENCY;

    // Create pending topup row first (we'll update with reference + payment_url)
    const { data: topup, error: topupError } = await (supabase.from("wallet_topups") as any)
      .insert({
        user_id: user.id,
        amount: Number(body.amount),
        currency,
        status: "pending",
        tenant_id: tenantId,
      })
      .select()
      .single();
    if (topupError) throw topupError;

    const reference = `wallet_topup_${(topup as any).id}`;
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/checkout/success?payment_type=wallet_topup`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: convertToSmallestUnit(Number(body.amount)),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        wallet_topup_id: (topup as any).id,
        user_id: user.id,
        amount: Number(body.amount),
        currency,
        tenant_id: tenantId,
      },
      tenantId,
    });

    const paymentUrl = paystackData?.data?.authorization_url || null;

    await (supabase.from("wallet_topups") as any)
      .update({
        paystack_reference: reference,
        payment_url: paymentUrl,
      })
      .eq("id", (topup as any).id);

    return successResponse({
      topup_id: (topup as any).id,
      payment_url: paymentUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to initialize wallet topup");
  }
}

