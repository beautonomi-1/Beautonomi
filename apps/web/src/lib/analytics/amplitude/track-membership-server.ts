import { EVENT_MEMBERSHIP_PURCHASED, EVENT_MEMBERSHIP_RENEWED } from "./types";
import { trackMoneyEventServer } from "./track-money-event-server";

type MembershipMoneyParams = {
  reference: string;
  membershipId: string;
  planId?: string | null;
  amount: number;
  currency?: string | null;
  customerId?: string | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
};

export async function trackMembershipPurchasedServer(params: MembershipMoneyParams): Promise<void> {
  await trackMoneyEventServer(EVENT_MEMBERSHIP_PURCHASED, {
    reference: params.reference,
    amount: params.amount,
    currency: params.currency,
    userId: params.customerId,
    paymentMethod: params.paymentMethod,
    paymentProvider: params.paymentProvider ?? "paystack",
    revenueType: "membership",
    productId: params.planId ?? params.membershipId,
    properties: { membership_id: params.membershipId, plan_id: params.planId ?? undefined },
  });
}

export async function trackMembershipRenewedServer(params: MembershipMoneyParams): Promise<void> {
  await trackMoneyEventServer(EVENT_MEMBERSHIP_RENEWED, {
    reference: params.reference,
    amount: params.amount,
    currency: params.currency,
    userId: params.customerId,
    paymentMethod: params.paymentMethod,
    paymentProvider: params.paymentProvider ?? "paystack",
    revenueType: "membership_renewal",
    productId: params.planId ?? params.membershipId,
    properties: { membership_id: params.membershipId, plan_id: params.planId ?? undefined },
  });
}
