/**
 * GET /api/cron/retry-subscription-payments
 *
 * Dunning retries for provider subscriptions in past_due.
 * A card with no recorded attempt is charged on this run. After an attempt,
 * the next tries are on days 1, 3, and 5.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { chargeAuthorization, convertFromSmallestUnit } from "@/lib/payments/paystack-complete";
import { classifySavedCardChargeStatus } from "@/lib/payments/saved-card-charge-status";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import {
  markOnlinePaymentCheckoutStatus,
  upsertOnlinePaymentCheckout,
} from "@/lib/payments/online-payment-checkouts";
import {
  DUNNING_MAX_RETRIES,
  dunningChargeIsDue,
  savedCardChargeOwnsPlan,
  savedCardRenewalPeriodAnchorMs,
  savedCardRenewalShouldOpenPeriod,
} from "@/lib/subscriptions/dunning-retry";
import { isPastDueWithinGrace, subscriptionPaymentFailedAccessNote } from "@/lib/iap/apple/billing-active";
import { SUBSCRIPTION_PAST_DUE_GRACE_DAYS } from "@/lib/subscriptions/feature-access";
import {
  capturedRenewalAccess,
  computePaidPeriodExpiresAt,
  paystackSubscriptionCollectsRenewal,
} from "@/lib/subscriptions/provider-billing-merchant";
import {
  recordProviderSubscriptionPayment,
  returnRecordedPaystackSubscriptionCharge,
} from "@/lib/subscriptions/provider-subscription-payment";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "retry-subscription-payments";
export const maxDuration = 300;

const MAX_RETRIES = DUNNING_MAX_RETRIES;

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
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await supabase
      .from("provider_subscriptions")
      .select(`
        id,
        provider_id,
        plan_id,
        billing_period,
        expires_at,
        paystack_authorization_code,
        paystack_subscription_code,
        billing_provider,
        dunning_retry_count,
        last_dunning_retry_at,
        updated_at,
        past_due_since,
        providers:provider_id ( user_id, business_name, tenant_id )
      `)
      .eq("status", "past_due")
      .neq("billing_provider", "apple")
      .neq("billing_provider", "stripe")
      .not("paystack_authorization_code", "is", null)
      .lt("dunning_retry_count", MAX_RETRIES);

    if (error) throw error;

    let retried = 0;
    let recovered = 0;
    let failed = 0;

    for (const sub of rows ?? []) {
      const row = sub as {
        id: string;
        provider_id: string;
        plan_id: string;
        billing_period?: string | null;
        expires_at?: string | null;
        paystack_authorization_code?: string | null;
        paystack_subscription_code?: string | null;
        billing_provider?: string | null;
        dunning_retry_count?: number | null;
        last_dunning_retry_at?: string | null;
        updated_at?: string | null;
        past_due_since?: string | null;
        providers?: { user_id?: string; business_name?: string; tenant_id?: string } | Array<{ user_id?: string; business_name?: string; tenant_id?: string }>;
      };

      const retryCount = Number(row.dunning_retry_count ?? 0);

      const { data: planRow } = await supabase
        .from("subscription_plans")
        .select("price_monthly, price_yearly, currency, name")
        .eq("id", row.plan_id)
        .maybeSingle();

      const plan = planRow as {
        price_monthly?: number | null;
        price_yearly?: number | null;
        currency?: string | null;
        name?: string | null;
      } | null;

      const isYearly = row.billing_period === "yearly";
      const amountMajor = Number(isYearly ? plan?.price_yearly : plan?.price_monthly) || 0;
      if (amountMajor <= 0) continue;

      const prov = Array.isArray(row.providers) ? row.providers[0] : row.providers;
      const billingProvider = String(row.billing_provider ?? "paystack").toLowerCase();
      const checkoutProvider = billingProvider === "flutterwave" ? "flutterwave" : "paystack";
      const cardOwners =
        billingProvider === "flutterwave" ? ["flutterwave"] : ["paystack", "manual"];
      const tenantId = prov?.tenant_id ?? undefined;
      const { data: capturedCheckout, error: capturedError } = await supabase
        .from("online_payment_checkouts")
        .select("reference, metadata, updated_at")
        .eq("provider", checkoutProvider)
        .eq("status", "pending")
        .contains("metadata", {
          subscription_id: row.id,
          kind: "subscription_renewal",
          dunning_retry: true,
          charge_captured: true,
        })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (capturedError) {
        console.error(
          "[retry-subscription-payments] captured checkout lookup failed:",
          row.id,
          capturedError,
        );
        continue;
      }
      if (capturedCheckout?.reference) {
        const meta =
          capturedCheckout.metadata &&
          typeof capturedCheckout.metadata === "object" &&
          !Array.isArray(capturedCheckout.metadata)
            ? (capturedCheckout.metadata as Record<string, unknown>)
            : {};
        const savedAmount = Number(meta.amount_major);
        const { data: capturedOwner } = await supabase
          .from("provider_subscriptions")
          .select("billing_provider, tenant_id, status, expires_at")
          .eq("id", row.id)
          .maybeSingle();
        const capturedOwnerRow = capturedOwner as {
          billing_provider?: string | null;
          tenant_id?: string | null;
          status?: string | null;
          expires_at?: string | null;
        } | null;
        const capturedOwnerProvider = String(capturedOwnerRow?.billing_provider ?? billingProvider);
        if (!savedCardChargeOwnsPlan(checkoutProvider, capturedOwnerProvider)) {
          if (checkoutProvider === "paystack") {
            const stillDue = savedCardRenewalShouldOpenPeriod(
              capturedOwnerRow?.status,
              capturedOwnerRow?.expires_at,
              Date.parse(nowIso),
            );
            const { data: capturedPay } = await supabase
              .from("payment_transactions")
              .select("status")
              .eq("provider", "paystack")
              .eq("reference", String(capturedCheckout.reference))
              .maybeSingle();
            const capturedPayStatus = String(
              (capturedPay as { status?: string } | null)?.status ?? "",
            ).toLowerCase();
            if (capturedPayStatus === "success" && !stillDue) {
              await markOnlinePaymentCheckoutStatus(String(capturedCheckout.reference), "paid");
            } else {
              await returnRecordedPaystackSubscriptionCharge({
                supabase,
                reference: String(capturedCheckout.reference),
                providerId: row.provider_id,
                tenantId: capturedOwnerRow?.tenant_id ?? tenantId ?? null,
                amountMajor: Number.isFinite(savedAmount) && savedAmount > 0 ? savedAmount : amountMajor,
              });
              await markOnlinePaymentCheckoutStatus(String(capturedCheckout.reference), "failed");
            }
          } else {
            console.error(
              "[retry-subscription-payments] saved-card charge kept; another account owns the plan",
              row.id,
              capturedOwnerProvider,
            );
          }
          continue;
        }
        const savedFees = Number(meta.fees_major);
        const chargedAt = String((capturedCheckout as { updated_at?: string }).updated_at ?? "");
        const billingPeriod = isYearly ? "yearly" : "monthly";
        const capturedAccess = capturedRenewalAccess({
          billingPeriod,
          chargedAt,
          currentExpiresAt: row.expires_at,
          currentPlanId: row.plan_id,
          currentBillingPeriod: row.billing_period,
          now: new Date(nowIso),
        });
        const periodEnd = capturedAccess?.expiresAt ?? null;
        if (periodEnd && capturedAccess) {
          try {
            const payment = await recordProviderSubscriptionPayment({
              supabase,
              providerId: row.provider_id,
              planId: row.plan_id,
              reference: String(capturedCheckout.reference),
              amountMajor: Number.isFinite(savedAmount) && savedAmount > 0 ? savedAmount : amountMajor,
              feesMajor: Number.isFinite(savedFees) && savedFees >= 0 ? savedFees : 0,
              kind: "subscription_renewal",
              billingPeriod,
              termEndsAt: periodEnd,
              description: `Subscription renewal (dunning retry) — ${plan?.name ?? "plan"}`,
              paymentProvider: checkoutProvider,
              tenantIdHint: tenantId,
              updateBillingPeriod: false,
            });
            if (!payment.recorded && !payment.alreadyRecorded) {
              console.error(
                "[retry-subscription-payments] captured charge is still not recorded:",
                row.id,
              );
              continue;
            }
            if (payment.chargeReturned) {
              await markOnlinePaymentCheckoutStatus(String(capturedCheckout.reference), "failed");
              continue;
            }
            const paidAtMs = Date.parse(chargedAt);
            const { data: opened, error: periodError } = await supabase
              .from("provider_subscriptions")
              .update({
                status: "active",
                past_due_since: null,
                expires_at: periodEnd,
                billing_period_start: capturedAccess.periodStart,
                last_payment_date: Number.isFinite(paidAtMs) ? new Date(paidAtMs).toISOString() : nowIso,
                billing_period_end: periodEnd,
                next_payment_date: periodEnd,
                dunning_retry_count: 0,
                last_dunning_retry_at: nowIso,
                updated_at: nowIso,
              })
              .eq("id", row.id)
              .in(
                "billing_provider",
                checkoutProvider === "flutterwave" ? ["flutterwave"] : ["paystack", "manual"],
              )
              .select("id");
            if (periodError) throw periodError;
            if (!opened?.length) {
              if (checkoutProvider === "paystack") {
                await returnRecordedPaystackSubscriptionCharge({
                  supabase,
                  reference: String(capturedCheckout.reference),
                  providerId: row.provider_id,
                  tenantId,
                  amountMajor: Number.isFinite(savedAmount) && savedAmount > 0 ? savedAmount : amountMajor,
                  financeTransactionId: payment.financeTransactionId,
                });
                await markOnlinePaymentCheckoutStatus(String(capturedCheckout.reference), "failed");
              } else {
                console.error(
                  "[retry-subscription-payments] saved-card charge kept; another account owns the plan",
                  row.id,
                );
              }
              continue;
            }
            await markOnlinePaymentCheckoutStatus(String(capturedCheckout.reference), "paid");
            recovered++;
          } catch (recordErr) {
            console.error(
              "[retry-subscription-payments] captured charge was not recorded:",
              row.id,
              recordErr,
            );
          }
          continue;
        }
        if (Number.isFinite(Date.parse(chargedAt))) {
          try {
            const payment = await recordProviderSubscriptionPayment({
              supabase,
              providerId: row.provider_id,
              planId: row.plan_id,
              reference: String(capturedCheckout.reference),
              amountMajor: Number.isFinite(savedAmount) && savedAmount > 0 ? savedAmount : amountMajor,
              feesMajor: Number.isFinite(savedFees) && savedFees >= 0 ? savedFees : 0,
              kind: "subscription_renewal",
              billingPeriod: isYearly ? "yearly" : "monthly",
              termEndsAt: row.expires_at && Number.isFinite(Date.parse(row.expires_at))
                ? new Date(Date.parse(row.expires_at)).toISOString()
                : null,
              description: `Subscription renewal (dunning retry) — ${plan?.name ?? "plan"}`,
              paymentProvider: checkoutProvider,
              tenantIdHint: tenantId,
              updateBillingPeriod: false,
            });
            if (!payment.recorded && !payment.alreadyRecorded) {
              console.error(
                "[retry-subscription-payments] captured charge is still not recorded:",
                row.id,
              );
              continue;
            }
            if (payment.chargeReturned) {
              await markOnlinePaymentCheckoutStatus(String(capturedCheckout.reference), "failed");
              continue;
            }
            const { data: activated, error: activateError } = await supabase
              .from("provider_subscriptions")
              .update({
                status: "active",
                past_due_since: null,
                ...(row.expires_at && Number.isFinite(Date.parse(row.expires_at))
                  ? { billing_period_end: new Date(Date.parse(row.expires_at)).toISOString() }
                  : {}),
                dunning_retry_count: 0,
                last_dunning_retry_at: nowIso,
                updated_at: nowIso,
              })
              .eq("id", row.id)
              .in(
                "billing_provider",
                checkoutProvider === "flutterwave" ? ["flutterwave"] : ["paystack", "manual"],
              )
              .select("id");
            if (activateError) throw activateError;
            if (!activated?.length) {
              if (checkoutProvider === "paystack") {
                await returnRecordedPaystackSubscriptionCharge({
                  supabase,
                  reference: String(capturedCheckout.reference),
                  providerId: row.provider_id,
                  tenantId,
                  amountMajor: Number.isFinite(savedAmount) && savedAmount > 0 ? savedAmount : amountMajor,
                  financeTransactionId: payment.financeTransactionId,
                });
                await markOnlinePaymentCheckoutStatus(String(capturedCheckout.reference), "failed");
              } else {
                console.error(
                  "[retry-subscription-payments] saved-card charge kept; another account owns the plan",
                  row.id,
                );
              }
              continue;
            }
            await markOnlinePaymentCheckoutStatus(String(capturedCheckout.reference), "paid");
            recovered++;
          } catch (recordErr) {
            console.error(
              "[retry-subscription-payments] captured charge was not recorded:",
              row.id,
              recordErr,
            );
          }
        }
        continue;
      }

      if (
        paystackSubscriptionCollectsRenewal(billingProvider, row.paystack_subscription_code)
      ) {
        continue;
      }

      if (!dunningChargeIsDue(row.last_dunning_retry_at, retryCount)) continue;

      const { data: userRow } = prov?.user_id
        ? await supabase.from("users").select("email").eq("id", prov.user_id).maybeSingle()
        : { data: null };
      const email = (userRow as { email?: string } | null)?.email;
      if (!email) continue;

      const reference = generateTransactionReference("sub_dunning", row.id);
      const planCurrency = plan?.currency || "ZAR";
      let chargeCaptured = false;

      try {
        let feesMajor = 0;

        if (billingProvider === "flutterwave") {
          const { chargeAndSettleFlutterwaveOffSession } = await import(
            "@/lib/payments/charge-flutterwave-off-session"
          );
          await upsertOnlinePaymentCheckout({
            reference,
            provider: "flutterwave",
            tenantId: tenantId ?? null,
            metadata: {
              provider_id: row.provider_id,
              plan_id: row.plan_id,
              kind: "subscription_renewal",
              dunning_retry: true,
              tenant_id: tenantId ?? "",
            },
          });
          const fw = await chargeAndSettleFlutterwaveOffSession(supabase, {
            tenantId: tenantId ?? null,
            token: String(row.paystack_authorization_code),
            email,
            amountInSmallestUnit: convertToSmallestUnit(amountMajor, planCurrency),
            currency: planCurrency,
            reference,
            metadata: {
              provider_id: row.provider_id,
              plan_id: row.plan_id,
              dunning_retry: true,
              subscription_id: row.id,
            },
          });
          if (fw.ok === false && fw.pending) {
            await supabase
              .from("provider_subscriptions")
              .update({ last_dunning_retry_at: nowIso })
              .eq("id", row.id)
              .in("billing_provider", cardOwners);
            continue;
          }
          if (fw.ok === false) throw new Error(fw.message);
        } else {
          const chargeResult = await chargeAuthorization(
            String(row.paystack_authorization_code),
            email,
            convertToSmallestUnit(amountMajor, planCurrency),
            {
              provider_id: row.provider_id,
              plan_id: row.plan_id,
              dunning_retry: true,
              subscription_id: row.id,
            },
            { tenantId, reference, currency: planCurrency },
          );

          const status = String(chargeResult.data?.status ?? "");
          const outcome = classifySavedCardChargeStatus(status);
          if (outcome === "still_open") {
            await supabase
              .from("provider_subscriptions")
              .update({ last_dunning_retry_at: nowIso })
              .eq("id", row.id)
              .in("billing_provider", cardOwners);
            continue;
          }
          if (outcome !== "success") {
            throw new Error(chargeResult.message || "Charge not successful");
          }

          feesMajor = convertFromSmallestUnit(
            Number(chargeResult.data?.fees ?? 0),
            chargeResult.data?.currency || planCurrency,
          );
        }

        const { data: ownerNow } = await supabase
          .from("provider_subscriptions")
          .select("billing_provider, tenant_id, status, expires_at")
          .eq("id", row.id)
          .maybeSingle();
        const ownerRow = ownerNow as {
          billing_provider?: string | null;
          tenant_id?: string | null;
          status?: string | null;
          expires_at?: string | null;
        } | null;
        const ownerProvider = String(ownerRow?.billing_provider ?? billingProvider);
        if (!savedCardChargeOwnsPlan(checkoutProvider, ownerProvider)) {
          chargeCaptured = true;
          if (checkoutProvider === "paystack") {
            const stillDue = savedCardRenewalShouldOpenPeriod(
              ownerRow?.status,
              ownerRow?.expires_at,
              Date.parse(nowIso),
            );
            const { data: existingPay } = await supabase
              .from("payment_transactions")
              .select("status")
              .eq("provider", "paystack")
              .eq("reference", reference)
              .maybeSingle();
            const payStatus = String(
              (existingPay as { status?: string } | null)?.status ?? "",
            ).toLowerCase();
            if (!(payStatus === "success" && !stillDue)) {
              await returnRecordedPaystackSubscriptionCharge({
                supabase,
                reference,
                providerId: row.provider_id,
                tenantId: ownerRow?.tenant_id ?? tenantId ?? null,
                amountMajor,
              });
            }
          } else {
            console.error(
              "[retry-subscription-payments] saved-card charge kept; another account owns the plan",
              row.id,
              ownerProvider,
            );
          }
          continue;
        }

        chargeCaptured = true;
        const billingPeriod = isYearly ? "yearly" : "monthly";
        const periodAnchor = new Date(
          savedCardRenewalPeriodAnchorMs(row.expires_at, Date.parse(nowIso)),
        );
        const periodEnd = computePaidPeriodExpiresAt(billingPeriod, periodAnchor);
        await upsertOnlinePaymentCheckout({
          reference,
          provider: checkoutProvider,
          tenantId: tenantId ?? null,
          metadata: {
            provider_id: row.provider_id,
            plan_id: row.plan_id,
            subscription_id: row.id,
            kind: "subscription_renewal",
            dunning_retry: true,
            charge_captured: true,
            amount_major: amountMajor,
            fees_major: feesMajor,
            tenant_id: tenantId ?? "",
          },
        });
        const payment = await recordProviderSubscriptionPayment({
          supabase,
          providerId: row.provider_id,
          planId: row.plan_id,
          reference,
          amountMajor,
          feesMajor,
          kind: "subscription_renewal",
          billingPeriod,
          termEndsAt: periodEnd,
          description: `Subscription renewal (dunning retry) — ${plan?.name ?? "plan"}`,
          paymentProvider: checkoutProvider,
          tenantIdHint: tenantId,
          updateBillingPeriod: false,
        });
        if (!payment.recorded && !payment.alreadyRecorded) {
          throw new Error("subscription payment was not recorded");
        }
        if (payment.chargeReturned) {
          await markOnlinePaymentCheckoutStatus(reference, "failed");
          continue;
        }
        const { data: opened, error: periodError } = await supabase
          .from("provider_subscriptions")
          .update({
            status: "active",
            past_due_since: null,
            expires_at: periodEnd,
            billing_period_start: periodAnchor.toISOString(),
            last_payment_date: nowIso,
            billing_period_end: periodEnd,
            next_payment_date: periodEnd,
            dunning_retry_count: 0,
            last_dunning_retry_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", row.id)
          .in(
            "billing_provider",
            checkoutProvider === "flutterwave" ? ["flutterwave"] : ["paystack", "manual"],
          )
          .select("id");
        if (periodError) throw periodError;
        if (!opened?.length) {
          if (checkoutProvider === "paystack") {
            await returnRecordedPaystackSubscriptionCharge({
              supabase,
              reference,
              providerId: row.provider_id,
              tenantId,
              amountMajor,
              financeTransactionId: payment.financeTransactionId,
            });
            await markOnlinePaymentCheckoutStatus(reference, "failed");
          } else {
            console.error(
              "[retry-subscription-payments] saved-card charge kept; another account owns the plan",
              row.id,
            );
          }
          continue;
        }
        await markOnlinePaymentCheckoutStatus(reference, "paid");

        recovered++;
      } catch (chargeErr) {
        if (chargeCaptured) {
          await supabase
            .from("provider_subscriptions")
            .update({ last_dunning_retry_at: nowIso })
            .eq("id", row.id)
            .in("billing_provider", cardOwners);
          console.error(
            "[retry-subscription-payments] charge succeeded but was not recorded:",
            row.id,
            chargeErr,
          );
          continue;
        }
        failed++;
        await supabase
          .from("provider_subscriptions")
          .update({
            dunning_retry_count: retryCount + 1,
            last_dunning_retry_at: nowIso,
          })
          .eq("id", row.id)
          .in("billing_provider", cardOwners);

        if (prov?.user_id) {
          try {
            await sendTemplateNotification(
              "subscription_payment_failed",
              [prov.user_id],
              {
                business_name: prov.business_name ?? "",
                grace_days: "3",
                app_url: process.env.NEXT_PUBLIC_APP_URL ?? "",
                access_note: subscriptionPaymentFailedAccessNote(
                  isPastDueWithinGrace({
                    billingProvider: row.billing_provider,
                    pastDueSince: row.past_due_since,
                    updatedAt: row.updated_at,
                    nowIso,
                    graceCutoffIso: new Date(
                      Date.now() - SUBSCRIPTION_PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
                    ).toISOString(),
                  }),
                ),
              },
              ["push", "email"],
              { appType: "provider", skipInApp: true },
            );
          } catch {
            /* best-effort */
          }
        }
        console.warn("[retry-subscription-payments] charge failed:", row.id, chargeErr);

        if (retryCount + 1 >= MAX_RETRIES) {
          void import("@/lib/integrations/slack/ops-triggers")
            .then(({ slackNotifySubscriptionChurned }) =>
              slackNotifySubscriptionChurned({
                tenantId: prov?.tenant_id ?? null,
                subscriptionId: row.id,
                providerId: row.provider_id,
                providerName: prov?.business_name ?? null,
                planName: plan?.name ?? null,
                reason: "dunning_exhausted",
                mrrMajor: amountMajor,
                currency: plan?.currency ?? null,
              }),
            )
            .catch(() => undefined);
          if (prov?.tenant_id && row.provider_id) {
            void import("@/lib/provider-ops/ops-case")
              .then(({ markCaseChurned }) =>
                markCaseChurned(
                  supabase,
                  prov.tenant_id as string,
                  row.provider_id as string,
                  "dunning_exhausted",
                ),
              )
              .catch(() => undefined);
          }
        }
      }
      retried++;
    }

    return successResponse({ retried, recovered, failed });
  } catch (error) {
    return handleApiError(error, "Cron: retry-subscription-payments failed");
  }
}
