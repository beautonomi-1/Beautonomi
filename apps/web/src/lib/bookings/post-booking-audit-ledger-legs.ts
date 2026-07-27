import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditLegDescriptionStyle = "shared" | "paystack_standard" | "paystack_pay_remaining";

type AuditLegInput = {
  bookingId: string;
  providerId: string | null;
  tenantId: string;
  bookingNumber: string;
  sourcePaymentId?: string | null;
  walletAmount?: number;
  giftCardAmount?: number;
  promotionDiscount?: number;
  membershipDiscount?: number;
  loyaltyDiscount?: number;
  createdAt?: string;
  /** Controls wallet/gift description wording. Discount legs only post when style is `shared`. */
  descriptionStyle?: AuditLegDescriptionStyle;
  attachSourcePaymentId?: boolean;
  dedupeScope?: "booking" | "booking_and_reference";
  /** Required when dedupeScope is booking_and_reference (pay-remaining split legs). */
  reference?: string | null;
};

function withSourcePaymentId(
  row: Record<string, unknown>,
  sourcePaymentId: string | null | undefined,
  attach: boolean,
): Record<string, unknown> {
  if (!attach || !sourcePaymentId) return row;
  return { ...row, source_payment_id: sourcePaymentId };
}

function walletDescription(style: AuditLegDescriptionStyle, bookingNumber: string, reference?: string | null): string {
  if (style === "paystack_standard") {
    return `Wallet contribution for booking ${bookingNumber} (split payment)`;
  }
  if (style === "paystack_pay_remaining" && reference) {
    return `Wallet (pay-remaining split) ref ${reference} booking ${bookingNumber}`;
  }
  return `Wallet payment for booking ${bookingNumber}`;
}

function giftPaymentDescription(
  style: AuditLegDescriptionStyle,
  bookingNumber: string,
  reference?: string | null,
): string {
  if (style === "paystack_standard") {
    return `Gift card contribution for booking ${bookingNumber} (split payment)`;
  }
  if (style === "paystack_pay_remaining" && reference) {
    return `Gift card (pay-remaining split) ref ${reference} booking ${bookingNumber}`;
  }
  return `Gift card payment for booking ${bookingNumber}`;
}

function giftLiabilityDescription(
  style: AuditLegDescriptionStyle,
  bookingNumber: string,
  reference?: string | null,
): string {
  if (style === "paystack_standard") {
    return `Gift card liability reduction for booking ${bookingNumber} (split payment)`;
  }
  if (style === "paystack_pay_remaining" && reference) {
    return `Gift card liability reduction (pay-remaining split) ref ${reference} booking ${bookingNumber}`;
  }
  return `Gift card liability reduction for booking ${bookingNumber}`;
}

async function legExists(
  supabase: SupabaseClient,
  input: AuditLegInput,
  transactionType: string,
): Promise<boolean> {
  if (input.dedupeScope === "booking_and_reference" && input.reference) {
    const { data } = await supabase
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", input.bookingId)
      .eq("transaction_type", transactionType)
      .ilike("description", `%${input.reference}%`)
      .maybeSingle();
    return Boolean(data);
  }
  const { data } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("transaction_type", transactionType)
    .maybeSingle();
  return Boolean(data);
}

/** Post wallet/gift split and discount audit legs when missing (Paystack parity for Stripe/Flutterwave). */
export async function postBookingAuditLedgerLegsIfMissing(
  supabase: SupabaseClient,
  input: AuditLegInput,
): Promise<void> {
  const now = input.createdAt ?? new Date().toISOString();
  const walletAmount = Math.max(0, Number(input.walletAmount ?? 0));
  const giftCardAmount = Math.max(0, Number(input.giftCardAmount ?? 0));
  const style = input.descriptionStyle ?? "shared";
  const attachSource = input.attachSourcePaymentId !== false;
  const postDiscountLegs = style === "shared";

  if (walletAmount > 0) {
    const exists = await legExists(supabase, input, "wallet_payment");
    if (!exists) {
      await supabase.from("finance_transactions").insert(
        withSourcePaymentId(
          {
            booking_id: input.bookingId,
            provider_id: input.providerId,
            tenant_id: input.tenantId,
            transaction_type: "wallet_payment",
            amount: walletAmount,
            fees: 0,
            commission: 0,
            net: walletAmount,
            description: walletDescription(style, input.bookingNumber, input.reference),
            created_at: now,
          },
          input.sourcePaymentId,
          attachSource,
        ),
      );
    }
  }

  if (giftCardAmount > 0) {
    const paymentExists = await legExists(supabase, input, "gift_card_payment");
    if (!paymentExists) {
      await supabase.from("finance_transactions").insert(
        withSourcePaymentId(
          {
            booking_id: input.bookingId,
            provider_id: input.providerId,
            tenant_id: input.tenantId,
            transaction_type: "gift_card_payment",
            amount: giftCardAmount,
            fees: 0,
            commission: 0,
            net: giftCardAmount,
            description: giftPaymentDescription(style, input.bookingNumber, input.reference),
            created_at: now,
          },
          input.sourcePaymentId,
          attachSource,
        ),
      );
    }
    const liabExists = await legExists(supabase, input, "gift_card_liability_reduction");
    if (!liabExists) {
      await supabase.from("finance_transactions").insert(
        withSourcePaymentId(
          {
            booking_id: input.bookingId,
            provider_id: input.providerId,
            tenant_id: input.tenantId,
            transaction_type: "gift_card_liability_reduction",
            amount: giftCardAmount,
            fees: 0,
            commission: 0,
            net: -giftCardAmount,
            description: giftLiabilityDescription(style, input.bookingNumber, input.reference),
            created_at: now,
          },
          input.sourcePaymentId,
          attachSource,
        ),
      );
    }
  }

  if (!postDiscountLegs) return;

  const discountLegs: Array<{ type: string; amount: number; description: string }> = [];
  const promo = Math.max(0, Number(input.promotionDiscount ?? 0));
  const membership = Math.max(0, Number(input.membershipDiscount ?? 0));
  const loyalty = Math.max(0, Number(input.loyaltyDiscount ?? 0));
  if (promo > 0) {
    discountLegs.push({
      type: "promotion_discount",
      amount: promo,
      description: `Promotion discount for booking ${input.bookingNumber}`,
    });
  }
  if (membership > 0) {
    discountLegs.push({
      type: "membership_discount",
      amount: membership,
      description: `Membership discount for booking ${input.bookingNumber}`,
    });
  }
  if (loyalty > 0) {
    discountLegs.push({
      type: "loyalty_redemption",
      amount: loyalty,
      description: `Loyalty redemption for booking ${input.bookingNumber}`,
    });
  }

  for (const leg of discountLegs) {
    const exists = await legExists(supabase, input, leg.type);
    if (exists) continue;
    await supabase.from("finance_transactions").insert(
      withSourcePaymentId(
        {
          booking_id: input.bookingId,
          provider_id: input.providerId,
          tenant_id: input.tenantId,
          transaction_type: leg.type,
          amount: leg.amount,
          fees: 0,
          commission: 0,
          net: -leg.amount,
          description: leg.description,
          created_at: now,
        },
        input.sourcePaymentId,
        attachSource,
      ),
    );
  }
}
