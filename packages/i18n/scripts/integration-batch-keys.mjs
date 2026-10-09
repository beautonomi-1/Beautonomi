/** Canonical SA Wave A integration batch (Stripe / Mailchimp / Twilio / web billing). */
export const SA_WAVE_A_LOCALES = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];

/** 21 mobile + 21 web = 42 dotted paths (verified against en.json). */
export const INTEGRATION_BATCH_KEYS = [
  "provider.mobile.screens.subscriptionSettings.billedThroughStripeTitle",
  "provider.mobile.screens.subscriptionSettings.billedThroughStripeBody",
  "provider.mobile.screens.subscriptionSettings.stripeManageUnavailable",
  "provider.mobile.screens.subscriptionSettings.paystackManageUnavailable",
  "provider.mobile.screens.moreTab.payoutCompleteStripeConnectFirst",
  "provider.mobile.screens.moreTab.stripeConnectReady",
  "provider.mobile.screens.moreTab.stripeConnectLast4",
  "provider.mobile.screens.payoutAccounts.stripeConnectTitle",
  "provider.mobile.screens.payoutAccounts.stripeConnectSubtitle",
  "provider.mobile.screens.payoutAccounts.stripeConnectReady",
  "provider.mobile.screens.payoutAccounts.stripeConnectIncomplete",
  "provider.mobile.screens.payoutAccounts.stripeConnectContinue",
  "provider.mobile.screens.payoutAccounts.stripeConnectStart",
  "provider.mobile.screens.payoutAccounts.stripeConnectBankLast4",
  "provider.mobile.screens.payoutAccounts.stripeConnectFailed",
  "provider.mobile.screens.emailIntegration.mailchimpNote",
  "provider.mobile.screens.emailIntegration.mailchimpKeyHint",
  "provider.mobile.screens.emailIntegration.mailchimpFromHint",
  "provider.mobile.screens.emailIntegration.mailchimpTestHint",
  "provider.mobile.screens.emailIntegration.providerSwitchRequiresNewKey",
  "provider.mobile.screens.twilioIntegration.whatsappCampaignLimitHint",
  "web.provider.finance.stripeConnectPayoutHint",
  "web.provider.finance.completeStripeConnect",
  "web.provider.pages.payment-setup.payoutAccountsDescStripe",
  "web.provider.pages.payment-setup.payoutAccountsDescPaystack",
  "web.provider.subscription.stripeBillingTitle",
  "web.provider.subscription.stripeBillingBody",
  "web.provider.subscription.stripeManageUnavailable",
  "web.provider.subscription.paystackManageUnavailable",
  "web.provider.moreHub.completeStripeConnectFirst",
  "web.provider.moreHub.stripeConnectReady",
  "web.provider.moreHub.stripeConnectLast4",
  "web.provider.settings.pages.billing/invoices/[id].payOnline",
  "web.provider.settings.pages.billing/invoices/[id].paying",
  "web.provider.settings.pages.billing/invoices/[id].paymentUnavailable",
  "web.provider.settings.pages.billing/invoices/[id].paymentStartFailed",
  "web.provider.settings.pages.billing/invoices/[id].paymentSuccessful",
  "web.provider.settings.pages.billing/invoices/[id].paymentPendingTitle",
  "web.provider.settings.pages.billing/invoices/[id].paymentPendingBody",
  "web.provider.settings.pages.billing/invoices/[id].paymentFailedDefault",
  "web.provider.settings.pages.billing/invoices/[id].paymentCancelled",
  "web.provider.settings.pages.billing/invoices/[id].verifyingPayment",
];

/** Keys allowed to match English (product / brand tokens). */
export const BATCH_SAME_AS_ENGLISH_ALLOWLIST = new Set([
  "provider.mobile.screens.payoutAccounts.stripeConnectTitle",
  "web.provider.settings.pages.payout-accounts.stripeConnectTitle",
]);

export function isBatchSameAsEnglishAllowed(key, enValue) {
  if (BATCH_SAME_AS_ENGLISH_ALLOWLIST.has(key)) return true;
  if (enValue === "Stripe Connect") return true;
  return false;
}
