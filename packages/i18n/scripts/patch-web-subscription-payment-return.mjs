#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function patch(rel, pairs) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, "utf8");
  for (const [from, to] of pairs) {
    if (s.includes(from)) s = s.split(from).join(to);
    else console.warn("MISSING:", from.slice(0, 60));
  }
  fs.writeFileSync(p, s);
  console.log("patched", rel);
}

// ─── Ads payment return ───
patch("apps/web/src/app/provider/settings/ads/payment-return/page.tsx", [
  [
    'import { verifyWithRetry } from "@/lib/payments/verify-with-retry";',
    'import { verifyWithRetry } from "@/lib/payments/verify-with-retry";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "function AdsPaymentReturnInner() {\n  const sp = useSearchParams();",
    `function AdsPaymentReturnInner() {
  const { t } = useTranslation();
  const pr = (key: string, opts?: Record<string, unknown>) =>
    t(\`web.provider.settings.pages.ads/payment-return.\${key}\`, opts as never) as string;
  const sp = useSearchParams();`,
  ],
  ['useState("Confirming your ads payment...")', "useState(pr(\"confirming\"))"],
  ['useState("Thanks — confirming with Paystack")', "useState(pr(\"confirmingHeadline\"))"],
  [
    `"You cancelled the payment. No charge was made. You can try again from your Ads dashboard."`,
    `pr("nativeCancelled")`,
  ],
  [
    `"This payment return link is invalid or incomplete. Open Ads and pull to refresh."`,
    `pr("nativeInvalid")`,
  ],
  [
    `"MISSING_REFERENCE: Paystack did not return a transaction reference on this return URL. Open Ads and pull to refresh — your payment may still apply via webhook."`,
    `"MISSING_REFERENCE: " + pr("missingReference")`,
  ],
  ['verifyResult.errorMessage || "Payment verification was not successful."', 'verifyResult.errorMessage || pr("confirmFailed")'],
  [
    `"Your bank may still be finalizing the charge. Open Ads in a moment and pull to refresh."`,
    `pr("bankFinalizing")`,
  ],
  ['"Almost there"', 'pr("almostThere")'],
  [
    `"Your campaign is being funded and will go live shortly."`,
    `pr("campaignFunded")`,
  ],
  ['"Payment confirmed"', 'pr("paymentConfirmed")'],
  [
    `"We could not confirm this payment against your ad order from the return page. Open Ads and pull to refresh, or contact support with your Paystack reference."`,
    `pr("verifyFailed")`,
  ],
  [
    `msg || "Payment could not be confirmed. Open Ads to check status or try again."`,
    `msg || pr("confirmFailed")`,
  ],
  ['<h1 className="text-xl font-semibold text-gray-900">Payment cancelled</h1>', '<h1 className="text-xl font-semibold text-gray-900">{pr("paymentCancelledTitle")}</h1>'],
  [
    `You cancelled the payment. No charge was made. You can try again from your Ads dashboard.`,
    `{pr("paymentCancelledBody")}`,
  ],
  [
    `<p className="text-gray-700">This payment return link is invalid or incomplete.</p>`,
    `<p className="text-gray-700">{pr("invalidLink")}</p>`,
  ],
  ['Return to app', '{pr("returnToApp")}'],
  ['Back to Ads', '{pr("backToAds")}'],
  ['? "Return to app"', '? pr("returnToApp")'],
  ['"Payment not completed."', 'pr("paymentNotCompleted")'],
  ['"Payment pending."', 'pr("paymentPending")'],
  ['"Payment complete."', 'pr("paymentComplete")'],
  [
    `"Return to the app and try again from your Ads dashboard."`,
    `pr("returnFailedBody")`,
  ],
  [
    `"Return to the app and pull to refresh in a moment."`,
    `pr("returnPendingBody")`,
  ],
  [
    `"Tap the button below to return to the app."`,
    `pr("returnSuccessBody")`,
  ],
  ['<p className="font-semibold text-gray-900">Payment summary</p>', '<p className="font-semibold text-gray-900">{pr("paymentSummary")}</p>'],
  ['<span className="font-medium text-gray-700">Order:</span>', '<span className="font-medium text-gray-700">{pr("orderLabel")}</span>'],
  ['<span className="font-medium text-gray-700">Reference:</span>', '<span className="font-medium text-gray-700">{pr("referenceLabel")}</span>'],
  ['Open Ads & campaigns', '{pr("openAdsCampaigns")}'],
  ['Loading…', '{pr("loading")}'],
]);

// ─── Terminal payment return ───
patch("apps/web/src/app/provider/settings/sales/terminal-payment-return/page.tsx", [
  [
    'import { verifyWithRetry } from "@/lib/payments/verify-with-retry";',
    'import { verifyWithRetry } from "@/lib/payments/verify-with-retry";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "function TerminalPaymentReturnInner() {\n  const sp = useSearchParams();",
    `function TerminalPaymentReturnInner() {
  const { t } = useTranslation();
  const pr = (key: string, opts?: Record<string, unknown>) =>
    t(\`web.provider.settings.pages.sales/terminal-payment-return.\${key}\`, opts as never) as string;
  const sp = useSearchParams();`,
  ],
  ['useState("Confirming your terminal order payment...")', "useState(pr(\"confirming\"))"],
  ['useState("Thanks — confirming with Paystack")', "useState(pr(\"confirmingHeadline\"))"],
  [
    `"You cancelled the payment. No charge was made."`,
    `pr("nativeCancelled")`,
  ],
  [`"This payment return link is invalid or incomplete."`, `pr("nativeInvalid")`],
  [
    `"MISSING_REFERENCE: Paystack did not return a transaction reference. Pull to refresh your orders — payment may still apply via webhook."`,
    `"MISSING_REFERENCE: " + pr("missingReference")`,
  ],
  ['verifyResult.errorMessage || "Payment verification was not successful."', 'verifyResult.errorMessage || pr("confirmFailed")'],
  [
    `"Your bank may still be finalizing the charge. Return to the app and pull to refresh your orders."`,
    `pr("bankFinalizing")`,
  ],
  ['"Almost there"', 'pr("almostThere")'],
  [
    `"Your terminal order is paid. Return to the app to track shipping and activation."`,
    `pr("orderPaid")`,
  ],
  ['"Payment confirmed"', 'pr("paymentConfirmed")'],
  [
    `"We could not confirm this payment. Open Terminal shop and pull to refresh, or contact support with your Paystack reference."`,
    `pr("confirmFailed")`,
  ],
  ['<h1 className="text-xl font-semibold text-gray-900">Payment cancelled</h1>', '<h1 className="text-xl font-semibold text-gray-900">{pr("paymentCancelledTitle")}</h1>'],
  [
    `You cancelled the payment. No charge was made. You can try again from Terminal shop.`,
    `{pr("paymentCancelledBody")}`,
  ],
  [
    `<p className="text-gray-700">This payment return link is invalid or incomplete.</p>`,
    `<p className="text-gray-700">{pr("invalidLink")}</p>`,
  ],
  ['Return to app', '{pr("returnToApp")}'],
  ['Back to Terminal shop', '{pr("backToTerminalShop")}'],
  ['Open Terminal shop', '{pr("openTerminalShop")}'],
  ['Loading…', '{pr("loading")}'],
]);

// ─── Subscription page (core strings) ───
patch("apps/web/src/app/provider/subscription/page.tsx", [
  [
    'import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";',
    'import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "export default function SubscriptionPage() {\n  const { provider } = useProviderPortal();",
    `export default function SubscriptionPage() {
  const { t } = useTranslation();
  const sub = (key: string, opts?: Record<string, unknown>) =>
    t(\`web.provider.subscription.\${key}\`, opts as never) as string;
  const { provider } = useProviderPortal();`,
  ],
  [
    'const APPLE_BILLED_MESSAGE =\n  "This plan is billed through the App Store. Manage, change, or cancel it in Apple ID → Subscriptions to avoid a second charge.";\n\ninterface SubscriptionPlan',
    "interface SubscriptionPlan",
  ],
  ['if (plan.is_free || p === 0) return "Free";', 'if (plan.is_free || p === 0) return sub("free");'],
  ['return plan.billing_period === "monthly" ? "/month" : "/year";', 'return plan.billing_period === "monthly" ? sub("perMonth") : sub("perYear");'],
  ['return "Reactivate free plan";', 'return sub("reactivateFreePlan");'],
  ['return "Activate free plan";', 'return sub("activateFreePlan");'],
  ['return "Continue with this plan";', 'return sub("continueWithPlan");'],
  ['if (subscriptionNeedsReactivation(subscription)) return "Reactivate free plan";', 'if (subscriptionNeedsReactivation(subscription)) return sub("reactivateFreePlan");'],
  ['if (subscription.status === "past_due") return "Update payment in App Store";', 'if (subscription.status === "past_due") return sub("updatePaymentAppStore");'],
  ['if (subscription.cancelled_at || subscription.auto_renew === false) return "Resume in App Store";', 'if (subscription.cancelled_at || subscription.auto_renew === false) return sub("resumeInAppStore");'],
  ['if (subscription.status === "past_due") return "Pay now / update card";', 'if (subscription.status === "past_due") return sub("payNowUpdateCard");'],
  ['if (subscription.paystack_sync_pending) return "Complete billing";', 'if (subscription.paystack_sync_pending) return sub("completeBilling");'],
  ['if (subscription.billing_issue?.action === "retry_payment") return "Retry payment";', 'if (subscription.billing_issue?.action === "retry_payment") return sub("retryPayment");'],
  ['if (subscription.billing_issue?.action === "complete_payment") return "Complete payment";', 'if (subscription.billing_issue?.action === "complete_payment") return sub("completePayment");'],
  ['if (subscription.cancelled_at) return "Resume billing";', 'if (subscription.cancelled_at) return sub("resumeBilling");'],
  ['return "Reactivate plan";', 'return sub("reactivatePlan");'],
  ['if (subscription.status === "active" && subscription.auto_renew === false) return "Extend plan";', 'if (subscription.status === "active" && subscription.auto_renew === false) return sub("extendPlan");'],
  [
    '? "Request timed out. Please try again."\n          : err instanceof FetchError\n            ? err.message\n            : "Failed to load subscription data";',
    '? sub("loadTimeout")\n          : err instanceof FetchError\n            ? err.message\n            : sub("loadFailed");',
  ],
  ['toast.info("Payment was cancelled. No charge was made.");', 'toast.info(sub("paymentCancelled"));'],
  ['toast.success("Payment successful! Your subscription is being activated...");', 'toast.success(sub("paymentSuccess"));'],
  [
    '"Payment was not completed. Please try another card or add funds."',
    'sub("paymentFailedDefault")',
  ],
  [
    `"Payment is still pending. We'll update your subscription once the bank confirms it."`,
    `sub("paymentPending")`,
  ],
  ['toast.error(APPLE_BILLED_MESSAGE);', 'toast.error(sub("appleBilledMessage"));'],
  ['toast.error("Plan not found");', 'toast.error(sub("planNotFound"));'],
  ['toast.message(APPLE_BILLED_MESSAGE);', 'toast.message(sub("appleBilledMessage"));'],
  [
    '`Plan change scheduled. Changes on ${when}.`',
    'sub("planChangeScheduled", { when })',
  ],
  ['const when = data.changes_on ? new Date(data.changes_on).toLocaleDateString() : "period end";', 'const when = data.changes_on ? new Date(data.changes_on).toLocaleDateString() : sub("periodEnd");'],
  ['toast.success("Free subscription activated!");', 'toast.success(sub("freeActivated"));'],
  ['toast.success("Subscription activated successfully!");', 'toast.success(sub("subscriptionActivated"));'],
  ['toast.error("Could not start subscription checkout. Please try again or contact support.");', 'toast.error(sub("checkoutFailed"));'],
  ['const msg = error instanceof FetchError ? error.message : "Failed to upgrade subscription";', 'const msg = error instanceof FetchError ? error.message : sub("upgradeFailed");'],
  [
    `"Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period."`,
    `sub("cancelConfirm")`,
  ],
  [
    `"Subscription cancelled. You'll retain access until the end of your billing period."`,
    `sub("cancelSuccess")`,
  ],
  ['const msg = error instanceof FetchError ? error.message : "Failed to cancel subscription";', 'const msg = error instanceof FetchError ? error.message : sub("cancelFailed");'],
  ['toast.success(d.message ?? "Plan renewed.");', 'toast.success(d.message ?? sub("planRenewed"));'],
  ['toast.error("No payment link received. Please try again or contact support.");', 'toast.error(sub("noPaymentLink"));'],
  ['toast.error("Failed to renew subscription");', 'toast.error(sub("renewFailed"));'],
  [
    `"Could not generate card update link. You can also try completing payment below."`,
    `sub("cardUpdateLinkFailed")`,
  ],
  ['toast.error("Could not generate a card update link. Please try again.");', 'toast.error(sub("cardUpdateFailed"));'],
  ['loadingMessage="Loading subscription..."', 'loadingMessage={sub("loading")}'],
  ['title="Failed to load subscription"', 'title={sub("loadErrorTitle")}'],
  ['label: "Retry"', 'label: sub("retry")'],
  ['Platform billing', '{sub("platformBilling")}'],
  ['title="Subscription"', 'title={sub("pageTitle")}'],
  ['subtitle="Published plans for your region — same catalog as public pricing."', 'subtitle={sub("pageSubtitle")}'],
  ['successHeadline="Payment complete!"', 'successHeadline={sub("paymentCompleteHeadline")}'],
  [
    'subtitle="Your subscription is active. Download the provider app to manage bookings on the go."',
    'subtitle={sub("paymentCompleteSubtitle")}',
  ],
  ['continueLabel={checkoutReturnToDashboard ? "Go to dashboard" : "View subscription"}', 'continueLabel={checkoutReturnToDashboard ? sub("goToDashboard") : sub("viewSubscription")}'],
  ['? "Payment not completed."', '? sub("returnBannerFailedTitle")'],
  ['? "Payment pending."', '? sub("returnBannerPendingTitle")'],
  [': "Payment complete."', ': sub("returnBannerSuccessTitle")'],
  [
    `? "Return to the app and try another card or add funds before retrying."`,
    `? sub("returnBannerFailedBody")`,
  ],
  [
    `? "Return to the app and refresh this screen in a moment."`,
    `? sub("returnBannerPendingBody")`,
  ],
  [`: "Tap the button below to return to the app."`, `: sub("returnBannerSuccessBody")`],
  ['Return to app', '{sub("returnToApp")}'],
  ['Your subscription', '{sub("yourSubscription")}'],
  ['Active', '{sub("statusActive")}'],
  ['Expired', '{sub("statusExpired")}'],
  ['Cancelled', '{sub("statusCancelled")}'],
  ['Cancelling at period end', '{sub("statusCancellingAtEnd")}'],
  ['Past Due', '{sub("statusPastDue")}'],
  ['App Store', '{sub("appStoreBadge")}'],
  ['{currentPlan?.name || "No plan selected"}', '{currentPlan?.name || sub("noPlanSelected")}'],
  ['What&apos;s included', '{sub("whatsIncluded")}'],
  ['Choose Plan', '{sub("choosePlan")}'],
  ['{managingCard ? "Opening…" : "Manage billing / update card"}', '{managingCard ? sub("opening") : sub("manageBilling")}'],
  ['Cancel in App Store', '{sub("cancelInAppStore")}'],
  ['Cancel Subscription', '{sub("cancelSubscription")}'],
  ['Change plan', '{sub("changePlan")}'],
  ['Monthly', '{sub("monthly")}'],
  ['Yearly', '{sub("yearly")}'],
  ['Popular', '{sub("popular")}'],
  ['Current', '{sub("current")}'],
  ['+ more included', '{sub("moreIncluded")}'],
  ['Your active selection', '{sub("activeSelection")}'],
  ['title="No subscription yet"', 'title={sub("noSubscriptionTitle")}'],
  ['description="Choose a subscription plan to activate billing"', 'description={sub("noSubscriptionDesc")}'],
  [`Don&apos;t close this tab — we&apos;re confirming with the payment provider and\n            activating your plan.`, `{sub("verifyingBody")}`],
  ['Confirming your payment…', '{sub("verifyingTitle")}'],
]);

// SubscriptionReviewDialog + UpgradeDialog hooks
const subPage = fs.readFileSync(path.join(root, "apps/web/src/app/provider/subscription/page.tsx"), "utf8");
let subFixed = subPage
  .replace(
    "function SubscriptionReviewDialog({\n  plan,\n  submitting,\n  onConfirm,\n  onClose,\n}: {",
    `function SubscriptionReviewDialog({
  plan,
  submitting,
  onConfirm,
  onClose,
}: {`,
  )
  .replace(
    "function SubscriptionReviewDialog({\n  plan,\n  submitting,\n  onConfirm,\n  onClose,\n}: {\n  plan: SubscriptionPlan | null;",
    `function SubscriptionReviewDialog({
  plan,
  submitting,
  onConfirm,
  onClose,
}: {
  plan: SubscriptionPlan | null;`,
  );

// Inject t into dialog components
subFixed = subFixed.replace(
  `function SubscriptionReviewDialog({
  plan,
  submitting,
  onConfirm,
  onClose,
}: {
  plan: SubscriptionPlan | null;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const priceLine = plan`,
  `function SubscriptionReviewDialog({
  plan,
  submitting,
  onConfirm,
  onClose,
}: {
  plan: SubscriptionPlan | null;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sub = (key: string, opts?: Record<string, unknown>) =>
    t(\`web.provider.subscription.\${key}\`, opts as never) as string;
  const priceLine = plan`,
);

subFixed = subFixed.replace(
  `<DialogTitle>Review your plan</DialogTitle>`,
  `<DialogTitle>{sub("reviewTitle")}</DialogTitle>`,
);
subFixed = subFixed.replace(
  `Confirm the details below before paying securely.`,
  `{sub("reviewDesc")}`,
);
subFixed = subFixed.replace(
  `{plan.billing_period === "yearly" ? "Yearly plan" : "Monthly plan"}`,
  `{plan.billing_period === "yearly" ? sub("yearlyPlan") : sub("monthlyPlan")}`,
);
subFixed = subFixed.replace(
  `<span className="text-sm font-semibold text-gray-900">Total due now</span>`,
  `<span className="text-sm font-semibold text-gray-900">{sub("totalDueNow")}</span>`,
);
subFixed = subFixed.replace(
  `This plan renews automatically each billing period. You can{" "}
                <span className="font-semibold text-gray-700">cancel anytime</span> and keep access
                until the end of the period you paid for.`,
  `{sub("renewNote")}`,
);
subFixed = subFixed.replace(
  `You&apos;re only charged after you confirm on the secure Paystack page. Your plan
                activates once payment is verified — never before.`,
  `{sub("paystackNote")}`,
);
subFixed = subFixed.replace(`Not now`, `{sub("notNow")}`);
subFixed = subFixed.replace(
  `{submitting ? "Opening secure checkout…" : \`Pay \${priceLine}\`}`,
  `{submitting ? sub("openingCheckout") : sub("payAmount", { amount: priceLine })}`,
);

subFixed = subFixed.replace(
  `function UpgradeDialog({
  open,
  onClose,
  plans,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  plans: SubscriptionPlan[];
  onUpgrade: (planId: string) => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);`,
  `function UpgradeDialog({
  open,
  onClose,
  plans,
  onUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  plans: SubscriptionPlan[];
  onUpgrade: (planId: string) => void;
}) {
  const { t } = useTranslation();
  const sub = (key: string, opts?: Record<string, unknown>) =>
    t(\`web.provider.subscription.\${key}\`, opts as never) as string;
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);`,
);

subFixed = subFixed.replace(
  `<DialogTitle>Upgrade Your Subscription</DialogTitle>`,
  `<DialogTitle>{sub("upgradeDialogTitle")}</DialogTitle>`,
);
subFixed = subFixed.replace(
  `Choose a plan to keep using Beautonomi's paid features.`,
  `{sub("upgradeDialogDesc")}`,
);
subFixed = subFixed.replace(
  `? "Free"\n                      : \`\${plan.currency} \${plan.price}/\${plan.billing_period === "monthly" ? "month" : "year"}\`}`,
  `? sub("free")\n                      : \`\${plan.currency} \${plan.price}\${plan.billing_period === "monthly" ? sub("perMonth") : sub("perYear")}\`}`,
);
subFixed = subFixed.replace(`Cancel`, `{sub("cancel")}`);
subFixed = subFixed.replace(`Upgrade`, `{sub("upgrade")}`);

fs.writeFileSync(path.join(root, "apps/web/src/app/provider/subscription/page.tsx"), subFixed);
console.log("patched subscription dialogs");
