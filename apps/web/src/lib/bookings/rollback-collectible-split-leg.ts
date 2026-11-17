/**
 * Reverse wallet/gift legs applied during a follow-up collectible payment when Paystack init fails.
 * A return that does not finish keeps its amount on the visit and leaves the payment row marked
 * so a later sweep can finish the same refund.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { bookingGiftVoidOutcome, giftCardCaptureSucceeded } from "@/lib/bookings/gift-value-still-due";
import { buildSyntheticWalletGiftProviderId, COLLECTIBLE_ROLLBACK_STILL_DUE } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { subtractMoney } from "@beautonomi/utils";

export { COLLECTIBLE_ROLLBACK_STILL_DUE };

export async function rollbackCollectibleSplitLeg(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    customerId: string;
    currency: string;
    tenantId: string | null;
    providerId: string;
    walletAmountToReverse: number;
    giftCardAmountToReverse: number;
    paymentLegSuffix: string;
    idempotencyKey: string;
  },
): Promise<{ walletDone: boolean; giftDone: boolean }> {
  const {
    bookingId,
    customerId,
    currency,
    tenantId,
    providerId,
    walletAmountToReverse,
    giftCardAmountToReverse,
    paymentLegSuffix,
    idempotencyKey,
  } = input;

  let giftRestoredOrCompensated = giftCardAmountToReverse <= 0;
  if (giftCardAmountToReverse > 0) {
    try {
      const { data: voided, error: voidErr } = await (admin.rpc as any)("void_gift_card_redemption", {
        p_booking_id: bookingId,
      });
      if (voidErr) {
        console.warn("[rollbackCollectibleSplitLeg] void_gift_card_redemption", bookingId, voidErr);
      } else if (voided === true) {
        giftRestoredOrCompensated = true;
      } else if (voided === false) {
        const walletTenantId = await resolveTenantIdForFinanceLedger(admin, {
          tenant_id: tenantId,
          provider_id: providerId,
        });
        const { error: giftCreditErr } = await (admin.rpc as any)("wallet_credit_admin", {
          p_user_id: customerId,
          p_amount: giftCardAmountToReverse,
          p_currency: currency || LAST_RESORT_CURRENCY,
          p_description: `Reversal: captured gift card could not be restored (${bookingId.slice(0, 8)})`,
          p_reference_id: bookingId,
          p_reference_type: "booking",
          p_tenant_id: walletTenantId,
          p_idempotency_key: `${idempotencyKey}:gift`,
        });
        if (giftCreditErr) {
          console.error("[rollbackCollectibleSplitLeg] gift wallet credit", bookingId, giftCreditErr);
        } else {
          giftRestoredOrCompensated = true;
        }
      }
    } catch (e) {
      console.warn("[rollbackCollectibleSplitLeg] void_gift_card_redemption", bookingId, e);
    }
  }

  let walletReturned = walletAmountToReverse <= 0;
  if (walletAmountToReverse > 0) {
    try {
      const walletTenantId = await resolveTenantIdForFinanceLedger(admin, {
        tenant_id: tenantId,
        provider_id: providerId,
      });
      const { error: walletErr } = await (admin.rpc as any)("wallet_credit_admin", {
        p_user_id: customerId,
        p_amount: walletAmountToReverse,
        p_currency: currency || LAST_RESORT_CURRENCY,
        p_description: `Reversal: follow-up payment not completed (${bookingId.slice(0, 8)})`,
        p_reference_id: bookingId,
        p_reference_type: "booking",
        p_tenant_id: walletTenantId,
        p_idempotency_key: idempotencyKey,
      });
      if (walletErr) {
        console.error("[rollbackCollectibleSplitLeg] wallet_credit_admin", bookingId, walletErr);
      } else {
        walletReturned = true;
      }
    } catch (e) {
      console.error("[rollbackCollectibleSplitLeg] wallet_credit_admin", bookingId, e);
    }
  }

  const walletProviderId = buildSyntheticWalletGiftProviderId("wallet", bookingId, paymentLegSuffix);
  const giftProviderId = buildSyntheticWalletGiftProviderId("gift_card", bookingId, paymentLegSuffix);
  const finishedIds = [
    walletAmountToReverse > 0 && walletReturned ? walletProviderId : null,
    giftCardAmountToReverse > 0 && giftRestoredOrCompensated ? giftProviderId : null,
  ].filter((id): id is string => Boolean(id));

  if (finishedIds.length > 0) {
    await admin
      .from("booking_payments")
      .delete()
      .eq("booking_id", bookingId)
      .in("payment_provider_id", finishedIds)
      .eq("status", "pending");
  }

  if (walletAmountToReverse > 0 && !walletReturned) {
    await rememberCollectibleRollback(admin, {
      bookingId,
      tenantId,
      kind: "wallet",
      amount: walletAmountToReverse,
      paymentProviderId: walletProviderId,
      idempotencyKey,
    });
  }
  if (giftCardAmountToReverse > 0 && !giftRestoredOrCompensated) {
    await rememberCollectibleRollback(admin, {
      bookingId,
      tenantId,
      kind: "gift_card",
      amount: giftCardAmountToReverse,
      paymentProviderId: giftProviderId,
      idempotencyKey,
    });
  }

  const { data: bookingRow } = await admin
    .from("bookings")
    .select("wallet_amount, gift_card_amount")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingRow) {
    const prevWallet = Number((bookingRow as { wallet_amount?: number }).wallet_amount ?? 0);
    const prevGift = Number((bookingRow as { gift_card_amount?: number }).gift_card_amount ?? 0);
    await admin
      .from("bookings")
      .update({
        wallet_amount: walletReturned
          ? Math.max(0, subtractMoney(prevWallet, walletAmountToReverse))
          : prevWallet,
        gift_card_amount: giftRestoredOrCompensated
          ? Math.max(0, subtractMoney(prevGift, giftCardAmountToReverse))
          : prevGift,
      })
      .eq("id", bookingId);
  }

  return { walletDone: walletReturned, giftDone: giftRestoredOrCompensated };
}

async function rememberCollectibleRollback(
  admin: SupabaseClient,
  input: {
    bookingId: string;
    tenantId: string | null;
    kind: "wallet" | "gift_card";
    amount: number;
    paymentProviderId: string;
    idempotencyKey: string;
  },
): Promise<void> {
  const marker = {
    notes: COLLECTIBLE_ROLLBACK_STILL_DUE,
    payment_provider_data: {
      source: "collectible_rollback",
      rollback_still_due: true,
      idempotency_key: input.idempotencyKey,
    },
  };
  const { data: existing } = await admin
    .from("booking_payments")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("payment_provider_id", input.paymentProviderId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    await admin.from("booking_payments").update(marker).eq("id", (existing as { id: string }).id);
    return;
  }
  await admin.from("booking_payments").insert({
    booking_id: input.bookingId,
    amount: input.amount,
    payment_method: input.kind,
    payment_provider: input.kind,
    payment_provider_id: input.paymentProviderId,
    status: "pending",
    ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    ...marker,
  });
}

/** Release a reserved gift card. If that return does not answer, remember it for the sweep. */
export async function releaseGiftCardOrRemember(
  admin: SupabaseClient,
  bookingId: string,
  tenantId: string | null,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data: voided, error } = await (admin.rpc as any)("void_gift_card_redemption", {
        p_booking_id: bookingId,
      });
      if (!error && bookingGiftVoidOutcome(voided) !== "unknown") return true;
      console.warn("[gift card] void failed", bookingId, error);
    } catch (err) {
      console.warn("[gift card] void failed", bookingId, err);
    }
  }
  await rememberCollectibleRollback(admin, {
    bookingId,
    tenantId,
    kind: "gift_card",
    amount: 0,
    paymentProviderId: buildSyntheticWalletGiftProviderId("gift_card", bookingId, ":void"),
    idempotencyKey: `gift_void_still_due:${bookingId}`,
  });
  return false;
}

/** The visit already counts this gift. The capture did not answer, so the sweep tries it again. */
export async function rememberGiftCaptureStillDue(
  admin: SupabaseClient,
  bookingId: string,
  tenantId: string | null,
): Promise<void> {
  const marker = {
    notes: COLLECTIBLE_ROLLBACK_STILL_DUE,
    payment_provider_data: {
      source: "gift_capture",
      rollback_still_due: true,
      capture_still_due: true,
      idempotency_key: `gift_capture_still_due:${bookingId}`,
    },
  };
  const paymentProviderId = buildSyntheticWalletGiftProviderId("gift_card", bookingId, ":capture");
  const { data: existing } = await admin
    .from("booking_payments")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("payment_provider_id", paymentProviderId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    await admin.from("booking_payments").update(marker).eq("id", (existing as { id: string }).id);
    return;
  }
  await admin.from("booking_payments").insert({
    booking_id: bookingId,
    amount: 0,
    payment_method: "gift_card",
    payment_provider: "gift_card",
    payment_provider_id: paymentProviderId,
    status: "pending",
    ...(tenantId ? { tenant_id: tenantId } : {}),
    ...marker,
  });
}

export async function retryUnfinishedCollectibleRollbacks(
  admin: SupabaseClient,
): Promise<number> {
  const { data, error } = await admin
    .from("booking_payments")
    .select("id, booking_id, amount, payment_method, payment_provider_id, payment_provider_data")
    .eq("status", "pending")
    .eq("notes", COLLECTIBLE_ROLLBACK_STILL_DUE)
    .limit(100);
  if (error) {
    console.warn("[collectible rollback] retry query failed", error);
    return 0;
  }

  let finished = 0;
  for (const row of (data ?? []) as Array<{
    id?: string;
    booking_id: string;
    amount?: number | null;
    payment_method?: string | null;
    payment_provider_id?: string | null;
    payment_provider_data?: { idempotency_key?: string | null; capture_still_due?: boolean | null } | null;
  }>) {
    if (row.payment_provider_data?.capture_still_due === true && row.id) {
      try {
        const { data: captured, error: captureErr } = await (admin.rpc as any)(
          "capture_gift_card_redemption",
          { p_booking_id: row.booking_id },
        );
        const captureMessage = String(captureErr?.message || "");
        const expired = /expired|no longer active/i.test(captureMessage);
        if (captureErr && !expired) continue;
        if (!expired && !giftCardCaptureSucceeded(captured) && captured !== false) continue;
        if (expired || captured === false) {
          await admin
            .from("bookings")
            .update({ gift_card_amount: 0, gift_card_id: null })
            .eq("id", row.booking_id);
        }
        await admin.from("booking_payments").delete().eq("id", row.id);
        finished += 1;
      } catch (err) {
        console.warn("[collectible rollback] gift capture retry failed", row.booking_id, err);
      }
      continue;
    }
    if (row.payment_method === "gift_card" && Number(row.amount ?? 0) <= 0.009 && row.id) {
      try {
        const { data: voided, error: voidErr } = await (admin.rpc as any)("void_gift_card_redemption", {
          p_booking_id: row.booking_id,
        });
        if (voidErr || bookingGiftVoidOutcome(voided) === "unknown") continue;
        await admin.from("booking_payments").delete().eq("id", row.id);
        finished += 1;
      } catch (err) {
        console.warn("[collectible rollback] gift void retry failed", row.booking_id, err);
      }
      continue;
    }
    const idempotencyKey = row.payment_provider_data?.idempotency_key;
    if (!row.booking_id || !idempotencyKey) continue;
    const { data: booking } = await admin
      .from("bookings")
      .select("customer_id, provider_id, tenant_id, currency")
      .eq("id", row.booking_id)
      .maybeSingle();
    const customerId = (booking as { customer_id?: string | null } | null)?.customer_id;
    const providerId = (booking as { provider_id?: string | null } | null)?.provider_id;
    if (!customerId || !providerId) continue;
    const kind = row.payment_method === "wallet" ? "wallet" : "gift_card";
    const prefix = `${kind}_booking:${row.booking_id}`;
    const providerRef = String(row.payment_provider_id ?? "");
    const paymentLegSuffix = providerRef.startsWith(prefix) ? providerRef.slice(prefix.length) : "";
    const amount = Number(row.amount ?? 0);
    try {
      const result = await rollbackCollectibleSplitLeg(admin, {
        bookingId: row.booking_id,
        customerId,
        currency: (booking as { currency?: string | null }).currency || LAST_RESORT_CURRENCY,
        tenantId: (booking as { tenant_id?: string | null }).tenant_id ?? null,
        providerId,
        walletAmountToReverse: kind === "wallet" ? amount : 0,
        giftCardAmountToReverse: kind === "gift_card" ? amount : 0,
        paymentLegSuffix,
        idempotencyKey,
      });
      if (kind === "wallet" ? result.walletDone : result.giftDone) finished += 1;
    } catch (err) {
      console.warn("[collectible rollback] retry failed", row.booking_id, err);
    }
  }
  return finished;
}
