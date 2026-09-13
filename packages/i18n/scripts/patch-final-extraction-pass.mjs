#!/usr/bin/env node
/**
 * Final i18n extraction pass: customer components, provider settings,
 * provider booking recurrence, web subscription & payment-return pages.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const enPath = path.join(root, "packages/i18n/src/locales/en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));

// ─── Customer mobile components ───
Object.assign(en.customer.mobile.components, {
  roleGate: {
    checkingAccess: "Checking access…",
    cantReachServer: "Can't reach server",
    somethingWentWrong: "Something went wrong",
    networkBody: "Check your internet connection and tap Retry.",
    apiBody: "We could not verify your account. Please try again or sign out.",
    retry: "Retry",
    signOut: "Sign out",
    blockedTitle: "This app is not available for this account",
    blockedBody:
      "Please use the right Beautonomi portal for your account or contact support.",
  },
  nativePermissions: {
    notificationsOffTitle: "Notifications are off",
    notificationsOffBody:
      "Turn on notifications in Settings to receive booking updates, messages, and reminders.",
    stepOf: "Step {{current}} of {{total}}",
    welcomeTitle: "Set up Beautonomi",
    welcomeBody:
      "Turn on notifications so you never miss booking updates and messages. Location and photo access are requested later when you use those features.",
    benefitBookingConfirmations: "Booking confirmations and reminders",
    benefitMessages: "Messages from your beauty professional",
    notificationsTitle: "Stay in the loop",
    notificationsBody:
      "Notifications alert you to booking updates, messages, and time-sensitive reminders.",
    continueSetupA11y: "Continue setup",
    continue: "Continue",
    continueA11y: "Continue",
  },
  countryPicker: {
    labelCountry: "Country",
    labelCountryOfIssue: "Country of issue",
    loadingCountries: "Loading countries…",
    selectCountry: "Select country",
    countrySelectedA11y: "Country: {{name}}",
    selectCountryA11y: "Select country",
    countryOfIssueSelectedA11y: "Country of issue: {{name}}",
    selectCountryOfIssueA11y: "Select country of issue",
    searchCountry: "Search country...",
    searchCountryA11y: "Search country",
    selectItemA11y: "Select {{name}}",
    closePickerA11y: "Close country picker",
  },
  onDemandWaiting: {
    defaultTitle: "Request sent",
    defaultMessage: "Connecting you with beauty.",
    timeoutLabel: "Timeout: {{seconds}}s",
  },
});

Object.assign(en.customer.mobile.components.phoneInput, {
  selectCountryCodeA11y: "Select country code",
  mobileNumberPlaceholder: "Mobile number",
  phoneNumberA11y: "Phone number",
  closeCountryPickerA11y: "Close country picker",
});

Object.assign(en.customer.mobile.screens.taxes, {
  taxStatusEmpty: "—",
  taxStatus_not_issued: "Not yet issued",
  taxStatus_pending: "Pending",
  taxStatus_verified: "Verified",
  taxStatus_approved: "Approved",
  taxStatus_rejected: "Rejected",
  taxStatus_active: "Active",
  taxStatus_inactive: "Inactive",
});

// ─── Provider mobile screens ───
en.provider.mobile.screens.billingSettings = {
  title: "Billing",
  subtitle: "Invoices & payment info",
  downloadFailed: "Download failed",
  shareFailed: "Share failed",
  errorTitle: "Error",
  invalidPhone: "Invalid phone",
  removePaymentMethodTitle: "Remove payment method?",
  removePaymentMethodBody:
    "{{label}} will be removed from your billing settings. Pending invoices that referenced it stay unchanged.",
  cancel: "Cancel",
  remove: "Remove",
  billingInformation: "Billing Information",
  edit: "Edit",
  billingAddress: "Billing Address",
  addressPlaceholder: "Street, City, Code",
  billingAddressA11y: "Billing address",
  billingEmail: "Billing Email",
  emailPlaceholder: "billing@example.com",
  billingEmailA11y: "Billing email",
  billingPhone: "Billing Phone",
  billingPhoneA11y: "Billing phone",
  save: "Save",
  addressLabel: "Address",
  emailLabel: "Email",
  phoneLabel: "Phone",
  notSet: "Not set",
  paymentMethods: "Payment Methods",
  noPaymentMethods: "No payment methods on file",
  expired: "Expired",
  expires: "Expires",
  default: "Default",
  setDefault: "Set default",
  setDefaultA11y: "Set {{name}} as default",
  removeMethodA11y: "Remove {{name}}",
  endingInA11y: "{{name}} ending in {{last4}}",
  invoices: "Invoices",
  filterAll: "All",
  filterUnpaid: "Unpaid",
  filterPaid: "Paid",
  noInvoicesTitle: "No invoices",
  noInvoicesDesc: "Your invoices will appear here",
  invoiceA11y: "Invoice {{number}}, {{amount}}, {{status}}",
  dueLabel: "Due {{date}}",
  paidLabel: "Paid {{date}}",
  invoiceSheetTitle: "Invoice {{number}}",
  invoiceLabel: "invoice",
};

en.provider.mobile.screens.teamSettings = {
  title: "Team Settings",
  subtitle: "Roles, permissions & commission",
  loadFailed: "Failed to load team settings",
  validationError: "Validation Error",
  roleNameRequired: "Role name is required",
  errorTitle: "Error",
  updatedTitle: "Updated",
  roleUpdated: "Role updated successfully.",
  createdTitle: "Created",
  roleCreated: "New role added.",
  deleteRoleTitle: "Delete Role",
  deleteRoleBody: 'Are you sure you want to delete "{{name}}"?',
  cancel: "Cancel",
  delete: "Delete",
  roles: "Roles",
  addRole: "Add Role",
  noRoles: "No roles configured yet",
  roleA11y: "Role {{name}}",
  editRoleA11y: "Edit {{name}} role",
  deleteRoleA11y: "Delete {{name}} role",
  permissionsCount: "{{count}} permissions",
  staffCommissions: "Staff Commissions",
  noStaff: "No staff members found",
  commissionLabel: "Commission %",
  saveCommission: "Save",
  editCommissionA11y: "Edit commission for {{name}}",
  permission_view_calendar: "View Calendar",
  permission_view_calendar_desc: "See the appointment calendar",
  permission_manage_bookings: "Manage Bookings",
  permission_manage_bookings_desc: "Create, edit, and cancel bookings",
  permission_view_clients: "View Clients",
  permission_view_clients_desc: "Access client list and profiles",
  permission_manage_clients: "Manage Clients",
  permission_manage_clients_desc: "Add and edit client records",
  permission_view_finances: "View Finances",
  permission_view_finances_desc: "See revenue and payment data",
  permission_manage_payments: "Manage Payments",
  permission_manage_payments_desc: "Process payments and refunds",
  permission_manage_services: "Manage Services",
  permission_manage_services_desc: "Add and edit services and pricing",
  permission_manage_products: "Manage Products",
  permission_manage_products_desc: "Manage product inventory",
  permission_view_reports: "View Reports",
  permission_view_reports_desc: "Access business reports",
  permission_manage_staff: "Manage Staff",
  permission_manage_staff_desc: "Add, edit, and remove staff members",
  permission_manage_settings: "Manage Settings",
  permission_manage_settings_desc: "Modify business settings",
  permission_manage_marketing: "Manage Marketing",
  permission_manage_marketing_desc: "Access marketing and promos",
  roleSheetAddTitle: "Add Role",
  roleSheetEditTitle: "Edit Role",
  roleNamePlaceholder: "Role name",
  roleDescPlaceholder: "Description (optional)",
  permissionsSection: "Permissions",
  saveRole: "Save Role",
};

en.provider.mobile.screens.marketingIntegrationsScreen = {
  title: "Marketing integrations",
  subtitle: "Connect marketing tools",
  intro:
    "Connect third-party services to send email, SMS, and WhatsApp to your clients. Setup runs in your secure Beautonomi dashboard and syncs back to the app automatically.",
  emailTitle: "Email (SendGrid / Mailchimp)",
  emailDesc: "Send transactional and marketing email to your clients.",
  twilioTitle: "SMS & WhatsApp (Twilio)",
  twilioDesc: "Send SMS and WhatsApp reminders, confirmations, and campaigns.",
  integrationA11y: "{{title}} integration",
  integrationHint: "Opens the integration setup in your browser",
  footer: "More integrations are added in the web dashboard and appear here automatically.",
  setupUnavailableTitle: "Setup unavailable",
  setupUnavailableBody:
    "Marketing integrations are configured in your web dashboard, but the app can't reach it. Please sign in at your Beautonomi dashboard on the web.",
  openFailedTitle: "Couldn't open",
  openFailedBody: "We couldn't open the integration setup. Please try again.",
};

// ─── Web provider subscription ───
en.web.provider.subscription = {
  appleBilledMessage:
    "This plan is billed through the App Store. Manage, change, or cancel it in Apple ID → Subscriptions to avoid a second charge.",
  loadTimeout: "Request timed out. Please try again.",
  loadFailed: "Failed to load subscription data",
  paymentCancelled: "Payment was cancelled. No charge was made.",
  paymentSuccess: "Payment successful! Your subscription is being activated...",
  paymentFailedDefault: "Payment was not completed. Please try another card or add funds.",
  paymentPending:
    "Payment is still pending. We'll update your subscription once the bank confirms it.",
  planNotFound: "Plan not found",
  planChangeScheduled: "Plan change scheduled. Changes on {{when}}.",
  periodEnd: "period end",
  freeActivated: "Free subscription activated!",
  subscriptionActivated: "Subscription activated successfully!",
  checkoutFailed: "Could not start subscription checkout. Please try again or contact support.",
  upgradeFailed: "Failed to upgrade subscription",
  cancelConfirm:
    "Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period.",
  cancelSuccess:
    "Subscription cancelled. You'll retain access until the end of your billing period.",
  cancelFailed: "Failed to cancel subscription",
  planRenewed: "Plan renewed.",
  noPaymentLink: "No payment link received. Please try again or contact support.",
  renewFailed: "Failed to renew subscription",
  cardUpdateLinkFailed:
    "Could not generate card update link. You can also try completing payment below.",
  cardUpdateFailed: "Could not generate a card update link. Please try again.",
  loading: "Loading subscription...",
  loadErrorTitle: "Failed to load subscription",
  retry: "Retry",
  platformBilling: "Platform billing",
  pageTitle: "Subscription",
  pageSubtitle: "Published plans for your region — same catalog as public pricing.",
  paymentCompleteHeadline: "Payment complete!",
  paymentCompleteSubtitle:
    "Your subscription is active. Download the provider app to manage bookings on the go.",
  goToDashboard: "Go to dashboard",
  viewSubscription: "View subscription",
  returnBannerFailedTitle: "Payment not completed.",
  returnBannerPendingTitle: "Payment pending.",
  returnBannerSuccessTitle: "Payment complete.",
  returnBannerFailedBody:
    "Return to the app and try another card or add funds before retrying.",
  returnBannerPendingBody: "Return to the app and refresh this screen in a moment.",
  returnBannerSuccessBody: "Tap the button below to return to the app.",
  returnToApp: "Return to app",
  yourSubscription: "Your subscription",
  statusActive: "Active",
  statusExpired: "Expired",
  statusCancelled: "Cancelled",
  statusCancellingAtEnd: "Cancelling at period end",
  statusPastDue: "Past Due",
  changesOn: "Changes on {{date}}{{plan}}",
  changesOnPlanSuffix: " → {{name}}",
  appStoreBadge: "App Store",
  noPlanSelected: "No plan selected",
  autoRenews: "Auto-renews{{date}}.",
  autoRenewsOn: " on {{date}}",
  paidUntil: "Paid until{{date}}.",
  paidUntilEnd: " the end of the period",
  manualExtensionNote:
    " Manual extension is available when you need it.",
  freeTierNote:
    "You are on the free tier. Premium tools (recurring appointments, automations, calendar sync, etc.) follow the feature switches on each subscription plan in admin — upgrade below when a paid plan includes the capability you need.",
  expiresOn: "Expires on: {{date}}",
  billingIssuePaymentFailed: "Payment was not completed",
  billingIssuePastDue: "Payment action needed",
  billingIssueDefault: "Billing action needed",
  appleBillingTitle: "Billed through the App Store",
  appleBillingBody:
    "Apple is the seller of record for this plan. Change, cancel, or update payment in Apple ID → Subscriptions. Web and Android checkout stay closed until this Apple subscription ends, so you are not charged twice.",
  manageInAppStore: "Manage in App Store",
  whatsIncluded: "What's included",
  choosePlan: "Choose Plan",
  opening: "Opening…",
  manageBilling: "Manage billing / update card",
  cancelInAppStore: "Cancel in App Store",
  cancelSubscription: "Cancel Subscription",
  changePlan: "Change plan",
  changePlanAppleNote:
    "This plan is billed through the App Store. Plan changes and cancellation happen in Apple ID → Subscriptions, not here.",
  changePlanWebNote:
    "Only plans linked to an active public pricing card for your region are shown — same as your marketing site.",
  monthly: "Monthly",
  yearly: "Yearly",
  popular: "Popular",
  current: "Current",
  moreIncluded: "+ more included",
  activeSelection: "Your active selection",
  noPlansForPeriod:
    "No {{period}} options are published for your region. Try the other billing period or ask an admin to enable pricing for this market.",
  noPurchasablePlans:
    "No purchasable plans are published for this workspace. In admin, open Finance → Plans, enable Show on public pricing page for the tiers you want providers to see, then refresh this page.",
  noSubscriptionTitle: "No subscription yet",
  noSubscriptionDesc: "Choose a subscription plan to activate billing",
  verifyingTitle: "Confirming your payment…",
  verifyingBody:
    "Don't close this tab — we're confirming with the payment provider and activating your plan.",
  reviewTitle: "Review your plan",
  reviewDesc: "Confirm the details below before paying securely.",
  yearlyPlan: "Yearly plan",
  monthlyPlan: "Monthly plan",
  totalDueNow: "Total due now",
  renewNote:
    "This plan renews automatically each billing period. You can cancel anytime and keep access until the end of the period you paid for.",
  paystackNote:
    "You're only charged after you confirm on the secure Paystack page. Your plan activates once payment is verified — never before.",
  notNow: "Not now",
  openingCheckout: "Opening secure checkout…",
  payAmount: "Pay {{amount}}",
  upgradeDialogTitle: "Upgrade Your Subscription",
  upgradeDialogDesc: "Choose a plan to keep using Beautonomi's paid features.",
  free: "Free",
  perMonth: "/month",
  perYear: "/year",
  upgrade: "Upgrade",
  reactivateFreePlan: "Reactivate free plan",
  activateFreePlan: "Activate free plan",
  continueWithPlan: "Continue with this plan",
  updatePaymentAppStore: "Update payment in App Store",
  resumeInAppStore: "Resume in App Store",
  payNowUpdateCard: "Pay now / update card",
  completeBilling: "Complete billing",
  retryPayment: "Retry payment",
  completePayment: "Complete payment",
  resumeBilling: "Resume billing",
  reactivatePlan: "Reactivate plan",
  extendPlan: "Extend plan",
};

// Payment return pages
en.web.provider.settings.pages["ads/payment-return"] = {
  confirming: "Confirming your ads payment...",
  confirmingHeadline: "Thanks — confirming with Paystack",
  paymentConfirmed: "Payment confirmed",
  campaignFunded: "Your campaign is being funded and will go live shortly.",
  almostThere: "Almost there",
  bankFinalizing:
    "Your bank may still be finalizing the charge. Open Ads in a moment and pull to refresh.",
  needOneMoreStep: "We need one more step",
  missingReference:
    "Paystack did not return a transaction reference on this return URL. Open Ads and pull to refresh — your payment may still apply via webhook.",
  verifyFailed:
    "We could not confirm this payment against your ad order from the return page. Open Ads and pull to refresh, or contact support with your Paystack reference.",
  confirmFailed: "Payment could not be confirmed. Open Ads to check status or try again.",
  paymentCancelledTitle: "Payment cancelled",
  paymentCancelledBody:
    "You cancelled the payment. No charge was made. You can try again from your Ads dashboard.",
  invalidLink: "This payment return link is invalid or incomplete.",
  returnToApp: "Return to app",
  backToAds: "Back to Ads",
  paymentNotCompleted: "Payment not completed.",
  paymentPending: "Payment pending.",
  paymentComplete: "Payment complete.",
  returnFailedBody: "Return to the app and try again from your Ads dashboard.",
  returnPendingBody: "Return to the app and pull to refresh in a moment.",
  returnSuccessBody: "Tap the button below to return to the app.",
  paymentSummary: "Payment summary",
  orderLabel: "Order:",
  referenceLabel: "Reference:",
  openAdsCampaigns: "Open Ads & campaigns",
  loading: "Loading…",
  nativeCancelled:
    "You cancelled the payment. No charge was made. You can try again from your Ads dashboard.",
  nativeInvalid:
    "This payment return link is invalid or incomplete. Open Ads and pull to refresh.",
};

en.web.provider.settings.pages["sales/terminal-payment-return"] = {
  confirming: "Confirming your terminal order payment...",
  confirmingHeadline: "Thanks — confirming with Paystack",
  paymentConfirmed: "Payment confirmed",
  orderPaid:
    "Your terminal order is paid. Return to the app to track shipping and activation.",
  almostThere: "Almost there",
  bankFinalizing:
    "Your bank may still be finalizing the charge. Return to the app and pull to refresh your orders.",
  needOneMoreStep: "We need one more step",
  missingReference:
    "Paystack did not return a transaction reference. Pull to refresh your orders — payment may still apply via webhook.",
  confirmFailed:
    "We could not confirm this payment. Open Terminal shop and pull to refresh, or contact support with your Paystack reference.",
  paymentCancelledTitle: "Payment cancelled",
  paymentCancelledBody:
    "You cancelled the payment. No charge was made. You can try again from Terminal shop.",
  invalidLink: "This payment return link is invalid or incomplete.",
  returnToApp: "Return to app",
  backToTerminalShop: "Back to Terminal shop",
  openTerminalShop: "Open Terminal shop",
  loading: "Loading…",
  nativeCancelled: "You cancelled the payment. No charge was made.",
  nativeInvalid: "This payment return link is invalid or incomplete.",
};

fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
console.log("en.json updated");

function patch(rel, pairs) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, "utf8");
  let n = 0;
  for (const [from, to] of pairs) {
    if (s.includes(from)) {
      s = s.split(from).join(to);
      n++;
    } else {
      console.warn(`MISSING in ${rel}:`, from.slice(0, 70));
    }
  }
  fs.writeFileSync(p, s);
  console.log(`${rel}: ${n} replacements`);
}

// ─── Customer RoleGate ───
patch("apps/customer/src/components/RoleGate.tsx", [
  [
    'import type { UserRole } from "@beautonomi/types";',
    'import type { UserRole } from "@beautonomi/types";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "export function RoleGate({ children }: RoleGateProps) {\n  const { user, signOut } = useAuth();",
    `export function RoleGate({ children }: RoleGateProps) {
  const { t } = useTranslation();
  const rg = (key: string) => t(\`customer.mobile.components.roleGate.\${key}\`) as string;
  const { user, signOut } = useAuth();`,
  ],
  ['message="Checking access…"', "message={rg(\"checkingAccess\")}"],
  ['{isNetwork ? "Can\'t reach server" : "Something went wrong"}', "{isNetwork ? rg(\"cantReachServer\") : rg(\"somethingWentWrong\")}"],
  [
    `{isNetwork\n            ? "Check your internet connection and tap Retry."\n            : "We could not verify your account. Please try again or sign out."}`,
    "{isNetwork ? rg(\"networkBody\") : rg(\"apiBody\")}",
  ],
  ['<Text style={{ fontWeight: "600", color: Colors.white }}>Retry</Text>', "<Text style={{ fontWeight: \"600\", color: Colors.white }}>{rg(\"retry\")}</Text>"],
  [
    '<Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Sign out</Text>',
    "<Text style={{ fontWeight: \"500\", color: Colors.gray[700] }}>{rg(\"signOut\")}</Text>",
  ],
  ["This app is not available for this account", "{rg(\"blockedTitle\")}"],
  [
    "Please use the right Beautonomi portal for your account or contact support.",
    "{rg(\"blockedBody\")}",
  ],
  [
    '<Text style={{ fontWeight: "500", color: Colors.white }}>Sign out</Text>',
    "<Text style={{ fontWeight: \"500\", color: Colors.white }}>{rg(\"signOut\")}</Text>",
  ],
]);

// ─── Customer GateLoadingScreen ───
patch("apps/customer/src/components/GateLoadingScreen.tsx", [
  [
    'import { BEAUTONOMI_B_PATH, BEAUTONOMI_SWIRL_PATH } from "@/components/brand-glyph-paths";',
    'import { BEAUTONOMI_B_PATH, BEAUTONOMI_SWIRL_PATH } from "@/components/brand-glyph-paths";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "}: GateLoadingScreenProps) {\n  const scheme = useColorScheme();",
    `}: GateLoadingScreenProps) {
  const { t } = useTranslation();
  const scheme = useColorScheme();`,
  ],
  ['accessibilityLabel={message ?? "Loading"}', 'accessibilityLabel={message ?? t("customer.mobile.components.gateLoading.defaultA11y")}'],
]);

// ─── Customer NativePermissionsOnboarding ───
patch("apps/customer/src/components/NativePermissionsOnboarding.tsx", [
  [
    'import { ONE_SIGNAL_APP_ID } from "@/config/public-env";',
    'import { ONE_SIGNAL_APP_ID } from "@/config/public-env";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "async function requestOneSignalPush(userId: string): Promise<void> {",
    `async function requestOneSignalPush(
  userId: string,
  np: (key: string) => string,
): Promise<void> {`,
  ],
  [
    `title: "Notifications are off",
          message: "Turn on notifications in Settings to receive booking updates, messages, and reminders.",`,
    `title: np("notificationsOffTitle"),
          message: np("notificationsOffBody"),`,
  ],
  [
    "export function NativePermissionsOnboarding() {\n  const insets = useSafeAreaInsets();",
    `export function NativePermissionsOnboarding() {
  const { t } = useTranslation();
  const np = (key: string, opts?: Record<string, unknown>) =>
    t(\`customer.mobile.components.nativePermissions.\${key}\`, opts as never) as string;
  const insets = useSafeAreaInsets();`,
  ],
  ["if (user?.id) await requestOneSignalPush(user.id);", "if (user?.id) await requestOneSignalPush(user.id, np);"],
  [
    "Step {stepIndex + 1} of {STEPS.length}",
    "{np(\"stepOf\", { current: stepIndex + 1, total: STEPS.length })}",
  ],
  ['title="Set up Beautonomi"', "title={np(\"welcomeTitle\")}"],
  [
    'body="Turn on notifications so you never miss booking updates and messages. Location and photo access are requested later when you use those features."',
    "body={np(\"welcomeBody\")}",
  ],
  ['<BenefitRow text="Booking confirmations and reminders" />', "<BenefitRow text={np(\"benefitBookingConfirmations\")} />"],
  ['<BenefitRow text="Messages from your beauty professional" />', "<BenefitRow text={np(\"benefitMessages\")} />"],
  ['title="Stay in the loop"', "title={np(\"notificationsTitle\")}"],
  [
    'body="Notifications alert you to booking updates, messages, and time-sensitive reminders."',
    "body={np(\"notificationsBody\")}",
  ],
  ['accessibilityLabel="Continue setup"', "accessibilityLabel={np(\"continueSetupA11y\")}"],
  ['<Text style={{ color: Colors.white, fontSize: 17, fontWeight: "600" }}>Continue</Text>', "<Text style={{ color: Colors.white, fontSize: 17, fontWeight: \"600\" }}>{np(\"continue\")}</Text>"],
  ['accessibilityLabel="Continue"', "accessibilityLabel={np(\"continueA11y\")}"],
]);

// ─── Country pickers & phone field ───
patch("apps/customer/src/components/AddressCountryPicker.tsx", [
  [
    'import { verticalFlatListPerf } from "@/lib/flatListPerformance";',
    'import { verticalFlatListPerf } from "@/lib/flatListPerformance";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "export function AddressCountryPicker({\n  value,\n  onChange,\n  label = \"Country\",",
    `export function AddressCountryPicker({
  value,
  onChange,
  label,`,
  ],
  [
    "}: AddressCountryPickerProps) {\n  const [countries, setCountries]",
    `}: AddressCountryPickerProps) {
  const { t } = useTranslation();
  const cp = (key: string, opts?: Record<string, unknown>) =>
    t(\`customer.mobile.components.countryPicker.\${key}\`, opts as never) as string;
  const resolvedLabel = label ?? cp("labelCountry");
  const [countries, setCountries]`,
  ],
  ["{label}", "{resolvedLabel}"],
  [
    'accessibilityLabel={displayText ? `Country: ${displayText}` : "Select country"}',
    'accessibilityLabel={displayText ? cp("countrySelectedA11y", { name: displayText }) : cp("selectCountryA11y")}',
  ],
  ['{loading && !displayText ? "Loading countries…" : displayText || "Select country"}', "{loading && !displayText ? cp(\"loadingCountries\") : displayText || cp(\"selectCountry\")}"],
  ["Select country", "{cp(\"selectCountry\")}"],
  ['placeholder="Search country..."', "placeholder={cp(\"searchCountry\")}"],
  ['accessibilityLabel="Search country"', "accessibilityLabel={cp(\"searchCountryA11y\")}"],
  ['accessibilityLabel={`Select ${item.name}`}', 'accessibilityLabel={cp("selectItemA11y", { name: item.name })}'],
]);

patch("apps/customer/src/components/CountryOfIssuePicker.tsx", [
  [
    'import { verticalFlatListPerf } from "@/lib/flatListPerformance";',
    'import { verticalFlatListPerf } from "@/lib/flatListPerformance";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "export function CountryOfIssuePicker({\n  value,\n  onChange,\n  label = \"Country of issue\",",
    `export function CountryOfIssuePicker({
  value,
  onChange,
  label,`,
  ],
  [
    "}: CountryOfIssuePickerProps) {\n  const [countries, setCountries]",
    `}: CountryOfIssuePickerProps) {
  const { t } = useTranslation();
  const cp = (key: string, opts?: Record<string, unknown>) =>
    t(\`customer.mobile.components.countryPicker.\${key}\`, opts as never) as string;
  const resolvedLabel = label ?? cp("labelCountryOfIssue");
  const [countries, setCountries]`,
  ],
  ["{label}", "{resolvedLabel}"],
  [
    'accessibilityLabel={selected ? `Country of issue: ${selected.name}` : "Select country of issue"}',
    'accessibilityLabel={selected ? cp("countryOfIssueSelectedA11y", { name: selected.name }) : cp("selectCountryOfIssueA11y")}',
  ],
  ['{loading ? "Loading countries…" : selected?.name ?? "Select country"}', "{loading ? cp(\"loadingCountries\") : selected?.name ?? cp(\"selectCountry\")}"],
  ["Select country", "{cp(\"selectCountry\")}"],
  ['placeholder="Search country..."', "placeholder={cp(\"searchCountry\")}"],
]);

patch("apps/customer/src/components/E164PhoneField.tsx", [
  [
    'import { verticalFlatListPerf } from "@/lib/flatListPerformance";',
    'import { verticalFlatListPerf } from "@/lib/flatListPerformance";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "accessibilityLabel = \"Phone number\",",
    "accessibilityLabel,",
  ],
  [
    "}: E164PhoneFieldProps) {\n  const { contentPadding } = useResponsive();",
    `}: E164PhoneFieldProps) {
  const { t } = useTranslation();
  const pi = (key: string) => t(\`customer.mobile.components.phoneInput.\${key}\`) as string;
  const { contentPadding } = useResponsive();`,
  ],
  [
    'placeholderNational ?? (resolvedDefaultDial === "+27" ? "82 123 4567" : "Mobile number");',
    'placeholderNational ?? (resolvedDefaultDial === "+27" ? "82 123 4567" : pi("mobileNumberPlaceholder"));',
  ],
  ['accessibilityLabel="Select country code"', "accessibilityLabel={pi(\"selectCountryCodeA11y\")}"],
  ["Enter your national number without repeating the country code. Leading 0 is optional.", "{pi(\"nationalNumberHint\")}"],
  ['accessibilityLabel={accessibilityLabel}', "accessibilityLabel={accessibilityLabel ?? pi(\"phoneNumberA11y\")}"],
  ['accessibilityLabel="Close country picker"', "accessibilityLabel={pi(\"closeCountryPickerA11y\")}"],
  ["Select country", "{pi(\"selectCountryTitle\")}"],
  ['placeholder="Search country..."', "placeholder={pi(\"searchCountry\")}"],
]);

patch("apps/customer/src/components/on-demand/WaitingScreen.tsx", [
  [
    'import { Colors } from "@/constants/colors";',
    'import { Colors } from "@/constants/colors";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "export function OnDemandWaitingScreen() {\n  const config = useModuleConfig(\"on_demand\");",
    `export function OnDemandWaitingScreen() {
  const { t } = useTranslation();
  const ow = (key: string, opts?: Record<string, unknown>) =>
    t(\`customer.mobile.components.onDemandWaiting.\${key}\`, opts as never) as string;
  const config = useModuleConfig("on_demand");`,
  ],
  ['const title = uiCopy.waiting_title ?? uiCopy.title ?? "Request sent";', "const title = uiCopy.waiting_title ?? uiCopy.title ?? ow(\"defaultTitle\");"],
  [
    'const message = uiCopy.waiting_headline ?? uiCopy.message ?? "Connecting you with beauty.";',
    "const message = uiCopy.waiting_headline ?? uiCopy.message ?? ow(\"defaultMessage\");",
  ],
  ["Timeout: {timeoutSec}s", "{ow(\"timeoutLabel\", { seconds: timeoutSec })}"],
]);

// ─── Customer taxes formatTaxStatus ───
patch("apps/customer/app/(app)/account-settings/taxes.tsx", [
  [
    "function formatTaxStatus(status: string | null): string {\n  if (!status) return \"—\";\n  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, \" \");\n}",
    `function formatTaxStatus(
  status: string | null,
  tx: (key: string) => string,
): string {
  if (!status) return tx("taxStatusEmpty");
  const normalized = status.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const key = \`taxStatus_\${normalized}\`;
  const label = tx(key);
  if (label !== \`customer.mobile.screens.taxes.\${key}\`) return label;
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}`,
  ],
  ["formatTaxStatus(doc.status ?? null)", "formatTaxStatus(doc.status ?? null, tx)"],
  ["formatTaxStatus(taxInfo.tax_status)", "formatTaxStatus(taxInfo.tax_status, tx)"],
]);

// ─── AccountStatusGuard gate message ───
patch("apps/customer/src/components/AccountStatusGuard.tsx", [
  [
    'import { GateLoadingScreen } from "@/components/GateLoadingScreen";',
    'import { GateLoadingScreen } from "@/components/GateLoadingScreen";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "export function AccountStatusGuard({ children }: { children: React.ReactNode }) {\n  const router = useRouter();",
    `export function AccountStatusGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();`,
  ],
  [
    'if (!checked) return <GateLoadingScreen message="Checking account…" />;',
    'if (!checked) return <GateLoadingScreen message={t("customer.mobile.components.gateLoading.checkingAccount")} />;',
  ],
]);

// ─── Provider booking detail recurrence helpers ───
patch("apps/provider/app/(app)/(tabs)/more/bookings/[id].tsx", [
  [
    "function recurrencePatternLabel(rule: unknown, fallbackFrequency?: unknown): string {",
    "function recurrencePatternLabel(\n  rule: unknown,\n  fallbackFrequency: unknown,\n  bk: (key: string, opts?: Record<string, unknown>) => string,\n): string {",
  ],
  [
    'if (frequency === "daily" || normalizedRule.includes("FREQ=DAILY")) return interval > 1 ? `Every ${interval} days` : "Daily";',
    'if (frequency === "daily" || normalizedRule.includes("FREQ=DAILY")) return interval > 1 ? bk("recurrenceEveryDays", { interval }) : bk("recurrenceDaily");',
  ],
  [
    'if (frequency === "biweekly" || (normalizedRule.includes("FREQ=WEEKLY") && interval === 2)) return "Every 2 weeks";',
    'if (frequency === "biweekly" || (normalizedRule.includes("FREQ=WEEKLY") && interval === 2)) return bk("recurrenceEvery2Weeks");',
  ],
  [
    'if (frequency === "weekly" || normalizedRule.includes("FREQ=WEEKLY")) return interval > 1 ? `Every ${interval} weeks` : "Weekly";',
    'if (frequency === "weekly" || normalizedRule.includes("FREQ=WEEKLY")) return interval > 1 ? bk("recurrenceEveryWeeks", { interval }) : bk("recurrenceWeekly");',
  ],
  [
    'if (frequency === "monthly" || normalizedRule.includes("FREQ=MONTHLY")) return interval > 1 ? `Every ${interval} months` : "Monthly";',
    'if (frequency === "monthly" || normalizedRule.includes("FREQ=MONTHLY")) return interval > 1 ? bk("recurrenceEveryMonths", { interval }) : bk("recurrenceMonthly");',
  ],
  ['return "Repeating visit";', 'return bk("recurrenceRepeating");'],
  [
    "function getRecurringDetails(booking: BookingDetail | null | undefined) {",
    "function getRecurringDetails(\n  booking: BookingDetail | null | undefined,\n  bk: (key: string, opts?: Record<string, unknown>) => string,\n) {",
  ],
  [
    '? `Starts ${formatSeriesDate(booking.recurrence_start_date ?? series.start_date)}`',
    '? bk("recurrenceStarts", { date: formatSeriesDate(booking.recurrence_start_date ?? series.start_date) })',
  ],
  [
    '? `ends ${formatSeriesDate(booking.recurrence_end_date ?? series.end_date)}`',
    '? bk("recurrenceEnds", { date: formatSeriesDate(booking.recurrence_end_date ?? series.end_date) })',
  ],
  [
    '? `${booking.recurrence_occurrences ?? series.occurrences} visits planned`',
    '? bk("recurrenceVisitsPlanned", { count: booking.recurrence_occurrences ?? series.occurrences })',
  ],
  [': "no end date",', ': bk("recurrenceNoEndDate"),'],
  [
    'generatedThrough ? `generated through ${generatedThrough}` : null,',
    'generatedThrough ? bk("recurrenceGeneratedThrough", { date: generatedThrough }) : null,',
  ],
  [
    "label: recurrencePatternLabel(rule, booking.recurrence_frequency ?? series.frequency),",
    "label: recurrencePatternLabel(rule, booking.recurrence_frequency ?? series.frequency, bk),",
  ],
  [
    'status: series.is_active === false ? "Paused series" : "Active series",',
    'status: series.is_active === false ? bk("recurrencePausedSeries") : bk("recurrenceActiveSeries"),',
  ],
  ["const recurringDetails = getRecurringDetails(b);", "const recurringDetails = getRecurringDetails(b, bk);"],
]);

// ─── Provider billing settings ───
patch("apps/provider/app/(app)/(tabs)/more/settings/billing.tsx", [
  [
    'import { validateE164Phone } from "@/lib/phone-country-codes";',
    'import { validateE164Phone } from "@/lib/phone-country-codes";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "export default function BillingScreen() {\n  useResponsive();",
    `export default function BillingScreen() {
  const { t } = useTranslation();
  const bs = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(\`provider.mobile.screens.billingSettings.\${key}\`, opts) as string,
    [t],
  );
  useResponsive();`,
  ],
  ['e instanceof Error ? e.message : "Download failed"', 'e instanceof Error ? e.message : bs("downloadFailed")'],
  ['Alert.alert("Download failed", msg);', 'Alert.alert(bs("downloadFailed"), msg);'],
  ['e instanceof Error ? e.message : "Share failed"', 'e instanceof Error ? e.message : bs("shareFailed")'],
  ['Alert.alert("Share failed", msg);', 'Alert.alert(bs("shareFailed"), msg);'],
  ['Alert.alert("Error", err);', 'Alert.alert(bs("errorTitle"), err);'],
  [
    '"Remove payment method?",',
    'bs("removePaymentMethodTitle"),',
  ],
  [
    '`${label} will be removed from your billing settings. Pending invoices that referenced it stay unchanged.`',
    'bs("removePaymentMethodBody", { label })',
  ],
  ['{ text: "Cancel", style: "cancel" }', '{ text: bs("cancel"), style: "cancel" }'],
  ['text: "Remove",', 'text: bs("remove"),'],
  ['Alert.alert("Invalid phone", pe);', 'Alert.alert(bs("invalidPhone"), pe);'],
  ['<ScreenHeader title="Billing" showBack />', '<ScreenHeader title={bs("title")} showBack />'],
  ['title="Billing" showBack subtitle="Invoices & payment info"', 'title={bs("title")} showBack subtitle={bs("subtitle")}'],
  ['title="Billing Information"', 'title={bs("billingInformation")}'],
  ['actionLabel={editing ? "Cancel" : "Edit"}', 'actionLabel={editing ? bs("cancel") : bs("edit")}'],
  ['>Billing Address</Text>', '>{bs("billingAddress")}</Text>'],
  ['placeholder="Street, City, Code"', 'placeholder={bs("addressPlaceholder")}'],
  ['accessibilityLabel="Billing address"', 'accessibilityLabel={bs("billingAddressA11y")}'],
  ['>Billing Email</Text>', '>{bs("billingEmail")}</Text>'],
  ['placeholder="billing@example.com"', 'placeholder={bs("emailPlaceholder")}'],
  ['accessibilityLabel="Billing email"', 'accessibilityLabel={bs("billingEmailA11y")}'],
  ['label="Billing Phone"', 'label={bs("billingPhone")}'],
  ['accessibilityLabel="Billing phone"', 'accessibilityLabel={bs("billingPhoneA11y")}'],
  ['label="Save"', 'label={bs("save")}'],
  ['label="Address"', 'label={bs("addressLabel")}'],
  ['|| "Not set"', '|| bs("notSet")'],
  ['label="Email"', 'label={bs("emailLabel")}'],
  ['label="Phone"', 'label={bs("phoneLabel")}'],
  ['<SectionHeader title="Payment Methods" />', '<SectionHeader title={bs("paymentMethods")} />'],
  ['>No payment methods on file</Text>', '>{bs("noPaymentMethods")}</Text>'],
  ['{pm.is_expired ? "Expired" : "Expires"}', '{pm.is_expired ? bs("expired") : bs("expires")}'],
  ['>Default</Text>', '>{bs("default")}</Text>'],
  ['>Set default</Text>', '>{bs("setDefault")}</Text>'],
  ['<SectionHeader title="Invoices" />', '<SectionHeader title={bs("invoices")} />'],
  ['{ label: "All", value: "all" }', '{ label: bs("filterAll"), value: "all" }'],
  ['{ label: "Unpaid", value: "sent,overdue" }', '{ label: bs("filterUnpaid"), value: "sent,overdue" }'],
  ['{ label: "Paid", value: "paid" }', '{ label: bs("filterPaid"), value: "paid" }'],
  ['title="No invoices"', 'title={bs("noInvoicesTitle")}'],
  ['description="Your invoices will appear here"', 'description={bs("noInvoicesDesc")}'],
]);

// ─── Provider team settings (core strings) ───
patch("apps/provider/app/(app)/(tabs)/more/settings/team-settings.tsx", [
  [
    'import { useState, useEffect } from "react";',
    'import { useState, useEffect, useCallback } from "react";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "const AVAILABLE_PERMISSIONS: Permission[] = [",
    `function useAvailablePermissions(ts: (key: string) => string): Permission[] {
  return [`,
  ],
  [
    '{ key: "view_calendar", label: "View Calendar", description: "See the appointment calendar" },',
    '{ key: "view_calendar", label: ts("permission_view_calendar"), description: ts("permission_view_calendar_desc") },',
  ],
  [
    '{ key: "manage_bookings", label: "Manage Bookings", description: "Create, edit, and cancel bookings" },',
    '{ key: "manage_bookings", label: ts("permission_manage_bookings"), description: ts("permission_manage_bookings_desc") },',
  ],
  [
    '{ key: "view_clients", label: "View Clients", description: "Access client list and profiles" },',
    '{ key: "view_clients", label: ts("permission_view_clients"), description: ts("permission_view_clients_desc") },',
  ],
  [
    '{ key: "manage_clients", label: "Manage Clients", description: "Add and edit client records" },',
    '{ key: "manage_clients", label: ts("permission_manage_clients"), description: ts("permission_manage_clients_desc") },',
  ],
  [
    '{ key: "view_finances", label: "View Finances", description: "See revenue and payment data" },',
    '{ key: "view_finances", label: ts("permission_view_finances"), description: ts("permission_view_finances_desc") },',
  ],
  [
    '{ key: "manage_payments", label: "Manage Payments", description: "Process payments and refunds" },',
    '{ key: "manage_payments", label: ts("permission_manage_payments"), description: ts("permission_manage_payments_desc") },',
  ],
  [
    '{ key: "manage_services", label: "Manage Services", description: "Add and edit services and pricing" },',
    '{ key: "manage_services", label: ts("permission_manage_services"), description: ts("permission_manage_services_desc") },',
  ],
  [
    '{ key: "manage_products", label: "Manage Products", description: "Manage product inventory" },',
    '{ key: "manage_products", label: ts("permission_manage_products"), description: ts("permission_manage_products_desc") },',
  ],
  [
    '{ key: "view_reports", label: "View Reports", description: "Access business reports" },',
    '{ key: "view_reports", label: ts("permission_view_reports"), description: ts("permission_view_reports_desc") },',
  ],
  [
    '{ key: "manage_staff", label: "Manage Staff", description: "Add, edit, and remove staff members" },',
    '{ key: "manage_staff", label: ts("permission_manage_staff"), description: ts("permission_manage_staff_desc") },',
  ],
  [
    '{ key: "manage_settings", label: "Manage Settings", description: "Modify business settings" },',
    '{ key: "manage_settings", label: ts("permission_manage_settings"), description: ts("permission_manage_settings_desc") },',
  ],
  [
    '{ key: "manage_marketing", label: "Manage Marketing", description: "Access marketing and promos" },',
    '{ key: "manage_marketing", label: ts("permission_manage_marketing"), description: ts("permission_manage_marketing_desc") },',
  ],
  [
    "];\n\nconst EMPTY_ROLE_FORM",
    "];\n}\n\nconst EMPTY_ROLE_FORM",
  ],
  [
    "export default function TeamSettingsScreen() {\n  useResponsive();",
    `export default function TeamSettingsScreen() {
  const { t } = useTranslation();
  const ts = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(\`provider.mobile.screens.teamSettings.\${key}\`, opts) as string,
    [t],
  );
  const AVAILABLE_PERMISSIONS = useAvailablePermissions(ts);
  useResponsive();`,
  ],
  ['Alert.alert("Validation Error", "Role name is required");', 'Alert.alert(ts("validationError"), ts("roleNameRequired"));'],
  ['Alert.alert("Error", error);', 'Alert.alert(ts("errorTitle"), error);'],
  ['Alert.alert("Updated", "Role updated successfully.");', 'Alert.alert(ts("updatedTitle"), ts("roleUpdated"));'],
  ['Alert.alert("Created", "New role added.");', 'Alert.alert(ts("createdTitle"), ts("roleCreated"));'],
  ['"Delete Role",', 'ts("deleteRoleTitle"),'],
  ['`Are you sure you want to delete "${capitalizeFirst(role.name)}"?`', 'ts("deleteRoleBody", { name: capitalizeFirst(role.name) })'],
  ['{ text: "Cancel", style: "cancel" }', '{ text: ts("cancel"), style: "cancel" }'],
  ['text: "Delete",', 'text: ts("delete"),'],
  ['<ScreenHeader title="Team Settings" showBack />', '<ScreenHeader title={ts("title")} showBack />'],
  ['roles === null ? "Failed to load team settings" : null', 'roles === null ? ts("loadFailed") : null'],
  ['message="Failed to load team settings"', 'message={ts("loadFailed")}'],
  ['title="Team Settings"\n        showBack\n        subtitle="Roles, permissions & commission"', 'title={ts("title")}\n        showBack\n        subtitle={ts("subtitle")}'],
  ['title="Roles"\n        actionLabel="Add Role"', 'title={ts("roles")}\n        actionLabel={ts("addRole")}'],
  ['No roles configured yet', '{ts("noRoles")}'],
  ['<SectionHeader title="Staff Commissions" />', '<SectionHeader title={ts("staffCommissions")} />'],
  ['No staff members found', '{ts("noStaff")}'],
  ['title={editingRoleId ? "Edit Role" : "Add Role"}', 'title={editingRoleId ? ts("roleSheetEditTitle") : ts("roleSheetAddTitle")}'],
]);

// ─── Provider marketing integrations ───
patch("apps/provider/app/(app)/(tabs)/more/settings/marketing-integrations.tsx", [
  [
    'import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";',
    'import { useCallback, useMemo } from "react";\nimport { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";\nimport { useTranslation } from "@beautonomi/i18n";',
  ],
  [
    "const INTEGRATIONS: Integration[] = [",
    "function buildIntegrations(mi: (key: string) => string): Integration[] {\n  return [",
  ],
  ['title: "Email (SendGrid / Mailchimp)",', 'title: mi("emailTitle"),'],
  [
    'description: "Send transactional and marketing email to your clients.",',
    'description: mi("emailDesc"),',
  ],
  ['title: "SMS & WhatsApp (Twilio)",', 'title: mi("twilioTitle"),'],
  [
    'description: "Send SMS and WhatsApp reminders, confirmations, and campaigns.",',
    'description: mi("twilioDesc"),',
  ],
  ["];\n\nexport default function MarketingIntegrationsScreen", "];\n}\n\nexport default function MarketingIntegrationsScreen"],
  [
    "export default function MarketingIntegrationsScreen() {\n  const router = useRouter();",
    `export default function MarketingIntegrationsScreen() {
  const { t } = useTranslation();
  const mi = useCallback(
    (key: string) => t(\`provider.mobile.screens.marketingIntegrationsScreen.\${key}\`) as string,
    [t],
  );
  const INTEGRATIONS = useMemo(() => buildIntegrations(mi), [mi]);
  const router = useRouter();`,
  ],
  ['"Setup unavailable",', 'mi("setupUnavailableTitle"),'],
  [
    '"Marketing integrations are configured in your web dashboard, but the app can\'t reach it. Please sign in at your Beautonomi dashboard on the web."',
    'mi("setupUnavailableBody")',
  ],
  ['"Couldn\'t open",', 'mi("openFailedTitle"),'],
  [
    'e instanceof Error ? e.message : "We couldn\'t open the integration setup. Please try again."',
    'e instanceof Error ? e.message : mi("openFailedBody")',
  ],
  ['title="Marketing integrations"\n        subtitle="Connect marketing tools"', 'title={mi("title")}\n        subtitle={mi("subtitle")}'],
  [
    "Connect third-party services to send email, SMS, and WhatsApp to your clients. Setup runs\n            in your secure Beautonomi dashboard and syncs back to the app automatically.",
    "{mi(\"intro\")}",
  ],
  ['accessibilityHint="Opens the integration setup in your browser"', 'accessibilityHint={mi("integrationHint")}'],
  [
    "More integrations are added in the web dashboard and appear here automatically.",
    "{mi(\"footer\")}",
  ],
]);

console.log("patch-final-extraction-pass complete");
