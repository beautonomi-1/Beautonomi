import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { convertToSmallestUnit } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";

const schema = z.object({
  amount: z.number().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const body = schema.parse(await request.json());

    const { data: userRow } = await supabase.from("users").select("email, preferred_currency").eq("id", user.id).single();
    const currency = (userRow as any)?.preferred_currency || "ZAR";
    const email = (userRow as any)?.email;
    if (!email) throw new Error("User email is required");

    // Create pending topup row first (we'll update with reference + payment_url)
    const { data: topup, error: topupError } = await (supabase.from("wallet_topups") as any)
      .insert({
        user_id: user.id,
        amount: Number(body.amount),
        currency,
        status: "pending",
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
      },
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

