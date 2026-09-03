/**
 * GET /api/cron/process-membership-renewals
 *
 * Platform-managed membership recurring billing cron.
 *
 * Per cycle (runs daily at 06:00 UTC):
 *  1. Check grace exhaustion: expire memberships that are past_due past the
 *     grace window and whose expires_at has passed.
 *  2. Claim rows due for renewal (next_billing_at <= now).
 *  3. Skip if plan is inactive; skip + notify if card is expired.
 *  4. chargeAuthorization; on synchronous success record ledger + advance term.
 *  5. On failure: past_due transition with retry scheduling + dunning notification.
 *
 * Idempotency: advance next_billing_at before charging so overlapping cron runs
 * cannot double-charge the same row.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { chargeAuthorization } from "@/lib/payments/paystack-complete";
import { convertToSmallestUnit, convertFromSmallestUnit } from "@/lib/payments/paystack";
import { isPaymentMethodExpired } from "@/lib/payments/payment-method-expiry";
import { recordMembershipPayment } from "@/lib/memberships/membership-payment";
import { applyScheduledMembershipPlanChange } from "@/lib/memberships/apply-scheduled-plan-change";
import { insertNotification } from "@/lib/notifications/insert-notification";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const MEMBERSHIP_PAST_DUE_GRACE_DAYS = 3;
const MEMBERSHIP_MAX_RENEWAL_RETRIES = 3;

/** Retry delay in days after each failure: +1d, +2d, +3d */
function retryDelayDays(failureCount: number): number {
  return Math.min(failureCount + 1, 3);
}

function advanceOneMonth(from: Date): Date {
  // Clamp to the last day of the target month so month-end anchors don't drift
  // (Jan 31 + 1 month = Feb 28/29, not Mar 3).
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

function generateRenewalReference(orderId: string): string {
  return `membership_renewal_${orderId}_${Date.now()}`;
}

const JOB_NAME = "process-membership-renewals";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error || "Unauthorized", { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date();
    const nowIso = now.toISOString();

    const results = {
      expired: 0,
      renewed: 0,
      failed: 0,
      skipped_inactive_plan: 0,
      skipped_card_expired: 0,
      errors: [] as string[],
    };

    // ── Step 1: Grace exhaustion ─────────────────────────────────────────────
    // Expire past_due memberships that have exceeded grace AND whose term has ended.
    const graceCutoff = new Date(Date.now() - MEMBERSHIP_PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredRows, error: expireErr } = await (supabase.from("user_memberships") as any)
      .update({
        status: "expired",
        auto_renew: false,
        next_billing_at: null,
        updated_at: nowIso,
      })
      .eq("status", "past_due")
      .lt("past_due_since", graceCutoff)
      .lt("expires_at", nowIso)
      .select("id, user_id, provider_id, plan_id");

    if (expireErr) {
      console.error("[membership-renewals] grace-expiry error:", expireErr);
    } else {
      results.expired = expiredRows?.length ?? 0;
      for (const row of (expiredRows ?? []) as any[]) {
        try {
          await notifyMembershipExpiredSafe(supabase, row.user_id, row.provider_id, row.plan_id, row.id);
        } catch (e) {
          console.error("[membership-renewals] notify expired failed:", e);
        }
      }
    }

    // ── Step 2: Claim rows due for renewal ───────────────────────────────────
    const { data: dueRows, error: dueErr } = await (supabase.from("user_memberships") as any)
      .select(`
        id,
        user_id,
        provider_id,
        plan_id,
        scheduled_plan_id,
        scheduled_change_at,
        status,
        expires_at,
        next_billing_at,
        paystack_authorization_code,
        payment_method_id,
        renewal_failure_count,
        past_due_since,
        billing_period,
        plan:membership_plans(id, name, price_monthly, currency, is_active),
        provider:providers(id, tenant_id)
      `)
      .eq("auto_renew", true)
      .in("status", ["active", "past_due"])
      .or("paused_until.is.null,paused_until.lt." + nowIso)
      .not("payment_method_id", "is", null)
      .not("paystack_authorization_code", "is", null)
      .lte("next_billing_at", nowIso)
      .order("next_billing_at", { ascending: true })
      .limit(50);

    if (dueErr) {
      console.error("[membership-renewals] due-rows query error:", dueErr);
      return handleApiError(dueErr, "Failed to fetch due memberships");
    }

    if (!dueRows?.length) {
      return successResponse({ message: "No renewals due", ...results });
    }

    for (const row of dueRows as any[]) {
      const membershipId: string = row.id;
      const userId: string = row.user_id;
      const providerId: string = row.provider_id;
      let planId: string = row.plan_id;
      try {
        const scheduled = await applyScheduledMembershipPlanChange(supabase, membershipId, now);
        if (scheduled.applied) {
          planId = scheduled.planId;
        }
      } catch (schedErr) {
        console.error(`[membership-renewals] scheduled plan change failed for ${membershipId}:`, schedErr);
      }
      const { data: planFresh } = planId !== row.plan_id
        ? await supabase.from("membership_plans").select("id, name, price_monthly, currency, is_active").eq("id", planId).maybeSingle()
        : { data: null };
      const plan = planFresh ?? (Array.isArray(row.plan) ? row.plan[0] : row.plan);
      const provider = Array.isArray(row.provider) ? row.provider[0] : row.provider;
      const tenantId: string | null = provider?.tenant_id ?? null;

      try {
        // Skip if plan has been deactivated or deleted.
        if (!plan || plan.is_active === false) {
          results.skipped_inactive_plan++;
          await (supabase.from("user_memberships") as any)
            .update({ auto_renew: false, updated_at: nowIso })
            .eq("id", membershipId);
          continue;
        }

        const authCode: string = row.paystack_authorization_code;
        const paymentMethodId: string = row.payment_method_id;

        // Load payment method to check expiry + get email.
        const { data: pmRow } = await (supabase.from("payment_methods") as any)
          .select("id, expiry_month, expiry_year, provider_payment_method_id")
          .eq("id", paymentMethodId)
          .eq("is_active", true)
          .maybeSingle();

        if (!pmRow) {
          // Payment method removed — turn off auto-renew.
          await (supabase.from("user_memberships") as any)
            .update({ auto_renew: false, payment_method_id: null, paystack_authorization_code: null, updated_at: nowIso })
            .eq("id", membershipId);
          results.skipped_card_expired++;
          continue;
        }

        if (isPaymentMethodExpired(pmRow.expiry_month, pmRow.expiry_year)) {
          results.skipped_card_expired++;
          // Transition to past_due (card expired), notify customer.
          const priorFailureCount: number = row.renewal_failure_count ?? 0;
          const newFailureCount = priorFailureCount + 1;
          // Keep the original past_due anchor so the grace window can actually
          // elapse; only start the clock on the first failure.
          const newPastDueSince: string = row.status === "past_due" ? (row.past_due_since ?? nowIso) : nowIso;
          if (newFailureCount >= MEMBERSHIP_MAX_RENEWAL_RETRIES) {
            // Retries exhausted — stop scheduling; grace expiry (Step 1) will expire it.
            await (supabase.from("user_memberships") as any)
              .update({
                status: "past_due",
                past_due_since: newPastDueSince,
                renewal_failure_count: newFailureCount,
                next_billing_at: null,
                auto_renew: false,
                updated_at: nowIso,
              })
              .eq("id", membershipId);
          } else {
            await (supabase.from("user_memberships") as any)
              .update({
                status: "past_due",
                past_due_since: newPastDueSince,
                renewal_failure_count: newFailureCount,
                next_billing_at: new Date(Date.now() + retryDelayDays(priorFailureCount) * 24 * 60 * 60 * 1000).toISOString(),
                updated_at: nowIso,
              })
              .eq("id", membershipId);
          }
          await notifyMembershipCardExpiredSafe(supabase, userId, providerId, planId, plan?.name, membershipId);
          continue;
        }

        // Get customer email for chargeAuthorization.
        const { data: userRow } = await (supabase.from("users") as any)
          .select("email")
          .eq("id", userId)
          .maybeSingle();
        const customerEmail: string | null = (userRow as { email?: string } | null)?.email ?? null;
        if (!customerEmail) {
          results.skipped_inactive_plan++;
          console.warn("[membership-renewals] no customer email for user:", userId);
          continue;
        }

        const priceMonthly: number = Number(plan.price_monthly ?? 0);
        if (priceMonthly <= 0) {
          // Free plan — just advance the billing date.
          const nextBillingAt = advanceOneMonth(new Date(row.next_billing_at ?? now));
          const newExpiresAt = advanceOneMonth(new Date(row.expires_at ?? now));
          await (supabase.from("user_memberships") as any)
            .update({ expires_at: newExpiresAt.toISOString(), next_billing_at: nextBillingAt.toISOString(), last_payment_at: nowIso, updated_at: nowIso })
            .eq("id", membershipId);
          results.renewed++;
          continue;
        }

        // Create a per-cycle membership_orders row for accounting.
        const { data: renewalOrder, error: orderErr } = await (supabase.from("membership_orders") as any)
          .insert({
            user_id: userId,
            provider_id: providerId,
            plan_id: planId,
            tenant_id: tenantId,
            amount: priceMonthly,
            currency: plan.currency ?? "ZAR",
            status: "pending",
            metadata: { source: "auto_renewal", membership_id: membershipId },
          })
          .select("id")
          .single();

        if (orderErr || !renewalOrder) {
          results.errors.push(`${membershipId}: failed to create renewal order`);
          continue;
        }

        const renewalReference = generateRenewalReference(renewalOrder.id);
        const amountSmallest = convertToSmallestUnit(priceMonthly);

        // Claim the row: advance next_billing_at BEFORE charging to prevent double-charge.
        const nextBillingAt = advanceOneMonth(new Date(row.next_billing_at ?? now));
        const newExpiresAt = advanceOneMonth(new Date(row.expires_at ?? now));

        // Atomic compare-and-swap on the exact next_billing_at we read: only one
        // cron invocation can win the claim. Without this guard two overlapping
        // runs both pass the `next_billing_at <= now` filter, both advance the
        // date, and both charge the customer's card. If the claim matches no rows
        // another run already took this cycle — skip to avoid a double charge.
        const { data: claimedRenewal } = await (supabase.from("user_memberships") as any)
          .update({
            next_billing_at: nextBillingAt.toISOString(),
            updated_at: nowIso,
          })
          .eq("id", membershipId)
          .eq("next_billing_at", row.next_billing_at)
          .select("id");

        if ((claimedRenewal?.length ?? 0) === 0) {
          // Roll back the accounting order we optimistically created; another run owns this cycle.
          await (supabase.from("membership_orders") as any)
            .update({ status: "failed", updated_at: nowIso })
            .eq("id", renewalOrder.id);
          console.log(`[membership-renewals] skip ${membershipId}: renewal cycle already claimed by another run`);
          continue;
        }

        // Charge the saved card. A thrown error (network, Paystack 4xx/5xx) is
        // treated as a synchronous failure so the row still enters dunning —
        // if the charge actually settled, the charge.success webhook repairs
        // the membership and the failed order idempotently.
        let chargeResult: Awaited<ReturnType<typeof chargeAuthorization>> | null = null;
        try {
          chargeResult = await chargeAuthorization(
            authCode,
            customerEmail,
            amountSmallest,
            {
              membership_order_id: renewalOrder.id,
              user_id: userId,
              provider_id: providerId,
              plan_id: planId,
              kind: "membership_renewal",
            },
            { tenantId, reference: renewalReference },
          );
        } catch (chargeErr) {
          console.error(`[membership-renewals] chargeAuthorization threw for ${membershipId}:`, chargeErr);
        }

        // Paystack returns HTTP 200 with envelope status:true even for declined
        // charges (data.status === "failed"), so BOTH must be checked. A truthy
        // envelope alone must never be treated as payment success.
        const envelopeOk = chargeResult?.status === true;
        const dataStatus: string | undefined = chargeResult?.data?.status;
        const chargeSucceeded = envelopeOk && dataStatus === "success";
        const chargePending =
          envelopeOk && ["pending", "processing", "queued", "ongoing"].includes(dataStatus ?? "");

        if (chargePending) {
          // Charge is in flight — neither success nor failure. Store the
          // reference and let the webhook settle the order; do not retry
          // (a retry would risk a double charge).
          await (supabase.from("membership_orders") as any)
            .update({ paystack_reference: renewalReference, updated_at: nowIso })
            .eq("id", renewalOrder.id);
          console.log(`[membership-renewals] charge pending for ${membershipId}, awaiting webhook (${renewalReference})`);
          continue;
        }

        if (chargeSucceeded) {
          // ── Synchronous success ──────────────────────────────────────────
          const grossAmount = convertFromSmallestUnit(chargeResult.data?.amount ?? amountSmallest);
          const feeAmount = convertFromSmallestUnit(chargeResult.data?.fees ?? 0);

          await (supabase.from("membership_orders") as any)
            .update({ status: "paid", paystack_reference: renewalReference, updated_at: nowIso })
            .eq("id", renewalOrder.id);

          await recordMembershipPayment({
            supabase,
            reference: renewalReference,
            orderId: renewalOrder.id,
            userId,
            providerId,
            planId,
            grossAmount,
            feeAmount,
            kind: "membership_renewal",
            tenantIdHint: tenantId,
          });

          await (supabase.from("user_memberships") as any)
            .update({
              status: "active",
              expires_at: newExpiresAt.toISOString(),
              last_payment_at: nowIso,
              renewal_failure_count: 0,
              past_due_since: null,
              updated_at: nowIso,
            })
            .eq("id", membershipId);

          results.renewed++;

          await notifyMembershipRenewedSafe(supabase, userId, providerId, planId, plan?.name, nextBillingAt, membershipId);
        } else {
          // ── Synchronous failure ──────────────────────────────────────────
          // Webhook will retry idempotently; we only transition state here.
          await (supabase.from("membership_orders") as any)
            .update({ status: "failed", paystack_reference: renewalReference, updated_at: nowIso })
            .eq("id", renewalOrder.id);

          const priorFailureCount: number = row.renewal_failure_count ?? 0;
          const newFailureCount = priorFailureCount + 1;
          // Keep the original past_due anchor so grace can elapse; only start
          // the clock on the first failure into past_due.
          const newPastDueSince: string =
            row.status === "past_due" ? (row.past_due_since ?? nowIso) : nowIso;

          if (newFailureCount >= MEMBERSHIP_MAX_RENEWAL_RETRIES) {
            // Retries exhausted — stop scheduling; grace expiry (Step 1) will expire it.
            await (supabase.from("user_memberships") as any)
              .update({
                status: "past_due",
                past_due_since: newPastDueSince,
                renewal_failure_count: newFailureCount,
                next_billing_at: null,
                auto_renew: false,
                updated_at: nowIso,
              })
              .eq("id", membershipId);
          } else {
            // Retry delay uses the pre-increment count so first retry is +1d,
            // second +2d, third +3d — matching the card-expired branch.
            const retryAt = new Date(
              Date.now() + retryDelayDays(priorFailureCount) * 24 * 60 * 60 * 1000,
            );
            await (supabase.from("user_memberships") as any)
              .update({
                status: "past_due",
                past_due_since: newPastDueSince,
                renewal_failure_count: newFailureCount,
                next_billing_at: retryAt.toISOString(),
                updated_at: nowIso,
              })
              .eq("id", membershipId);
          }

          results.failed++;

          await notifyMembershipPaymentFailedSafe(supabase, userId, providerId, planId, plan?.name, membershipId, newFailureCount);
        }
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
        results.errors.push(`${membershipId}: ${msg}`);
        console.error(`[membership-renewals] error processing ${membershipId}:`, rowErr);
      }
    }

    return successResponse({
      message: "Membership renewals processed",
      checked: dueRows.length,
      ...results,
    });
  } catch (error) {
    return handleApiError(error, "Cron: process-membership-renewals failed");
  }
}

// ── Notification helpers (best-effort, never throw) ──────────────────────────

async function loadPlanAndProviderNames(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  planId: string,
  providerId: string,
): Promise<{ planName: string; providerName: string }> {
  const [{ data: plan }, { data: provider }] = await Promise.all([
    (supabase.from("membership_plans") as any).select("name").eq("id", planId).maybeSingle(),
    (supabase.from("providers") as any).select("business_name").eq("id", providerId).maybeSingle(),
  ]);
  return {
    planName: (plan as { name?: string } | null)?.name ?? "Membership",
    providerName: (provider as { business_name?: string } | null)?.business_name ?? "your salon",
  };
}

async function notifyMembershipPaymentFailedSafe(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  providerId: string,
  planId: string,
  planName: string | null | undefined,
  membershipId: string,
  attempt: number,
): Promise<void> {
  try {
    const { providerName } = await loadPlanAndProviderNames(supabase, planId, providerId);
    const name = planName ?? "Membership";
    const dedupeKey = `mem_failed_${membershipId}_${attempt}`;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .contains("data", { reminder_key: dedupeKey })
      .limit(1);
    if (existing?.length) return;

    await insertNotification({
      user_id: userId,
      type: "membership_payment_failed",
      title: "Membership payment failed",
      message: `We could not charge your card for your ${name} membership at ${providerName}. Please update your payment method.`,
      data: { reminder_key: dedupeKey, membership_id: membershipId, provider_id: providerId, plan_id: planId },
      action_url: "/account-settings/membership",
    });

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    await sendTemplateNotification(
      "membership_payment_failed",
      [userId],
      { membership_name: name, provider_name: providerName },
      ["push"],
      { appType: "customer", skipInApp: true },
    );
  } catch (e) {
    console.error("[membership-renewals] notifyMembershipPaymentFailed failed:", e);
  }
}

async function notifyMembershipCardExpiredSafe(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  providerId: string,
  planId: string,
  planName: string | null | undefined,
  membershipId: string,
): Promise<void> {
  try {
    const { providerName } = await loadPlanAndProviderNames(supabase, planId, providerId);
    const name = planName ?? "Membership";
    const dedupeKey = `mem_card_expired_${membershipId}`;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .contains("data", { reminder_key: dedupeKey })
      .limit(1);
    if (existing?.length) return;

    await insertNotification({
      user_id: userId,
      type: "membership_card_expired",
      title: "Update your payment card",
      message: `Your saved card has expired and we cannot renew your ${name} membership at ${providerName}.`,
      data: { reminder_key: dedupeKey, membership_id: membershipId, provider_id: providerId, plan_id: planId },
      action_url: "/account-settings/membership",
    });

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    await sendTemplateNotification(
      "membership_card_expired",
      [userId],
      { membership_name: name, provider_name: providerName },
      ["push"],
      { appType: "customer", skipInApp: true },
    );
  } catch (e) {
    console.error("[membership-renewals] notifyMembershipCardExpired failed:", e);
  }
}

async function notifyMembershipExpiredSafe(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  providerId: string,
  planId: string,
  membershipId: string,
): Promise<void> {
  try {
    const { planName, providerName } = await loadPlanAndProviderNames(supabase, planId, providerId);
    const dedupeKey = `mem_expired_${membershipId}`;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .contains("data", { reminder_key: dedupeKey })
      .limit(1);
    if (existing?.length) return;

    await insertNotification({
      user_id: userId,
      type: "membership_expired",
      title: "Membership expired",
      message: `Your ${planName} membership at ${providerName} has expired. Rejoin to continue enjoying your benefits.`,
      data: { reminder_key: dedupeKey, membership_id: membershipId, provider_id: providerId, plan_id: planId },
      action_url: "/account-settings/membership",
    });

    const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
    await sendTemplateNotification(
      "membership_expired",
      [userId],
      { membership_name: planName, provider_name: providerName },
      ["push"],
      { appType: "customer", skipInApp: true },
    );
  } catch (e) {
    console.error("[membership-renewals] notifyMembershipExpired failed:", e);
  }
}

async function notifyMembershipRenewedSafe(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  providerId: string,
  planId: string,
  planName: string | null | undefined,
  nextBillingAt: Date,
  membershipId: string,
): Promise<void> {
  try {
    const { providerName } = await loadPlanAndProviderNames(supabase, planId, providerId);
    const name = planName ?? "Membership";
    const nextDate = nextBillingAt.toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
    await insertNotification({
      user_id: userId,
      type: "membership_renewal_success",
      title: "Membership renewed",
      message: `Your ${name} membership at ${providerName} has been renewed. Next billing: ${nextDate}.`,
      data: { membership_id: membershipId, provider_id: providerId, plan_id: planId },
      action_url: "/account-settings/membership",
    });
  } catch (e) {
    console.error("[membership-renewals] notifyMembershipRenewed failed:", e);
  }
}
