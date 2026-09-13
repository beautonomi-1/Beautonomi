#!/usr/bin/env node
/**
 * Wire remaining customer mobile i18n: booking-detail details tab,
 * account-settings (reviews, privacy, language), components, preferences language filter keys.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const enPath = path.join(root, "packages/i18n/src/locales/en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));

const mobile = en.customer.mobile;

// --- bookingDetail details-tab keys ---
Object.assign(mobile.screens.bookingDetail, {
  visitTypeLabel: "Visit type",
  houseCallTitle: "House call",
  houseCallBody:
    "Your professional travels to the address below. Tracking and arrival verification (when your provider arrives) appear on the Tracking tab.",
  houseCallTravelFeeHint: "A travel fee is included in your price breakdown below.",
  inSalonTitle: "In-salon visit",
  inSalonBody:
    "You go to the provider's salon or workspace. Use the address below for directions and parking.",
  groupBookingLabel: "Group booking",
  groupPaidSummary: "{{amount}} paid for the whole group",
  viewGroupDetails: "View group details",
  viewGroupDetailsA11y: "View group booking details",
  providerFallback: "Provider",
  brandFallback: "Beautonomi",
  statusCheckedIn: "Checked in",
  statusPaymentPending: "Payment pending",
  servicesSection: "Services",
  serviceFallback: "Service",
  serviceLineFallback: "Service {{index}}",
  withStaff: "with {{name}}",
  durationMinShort: "{{minutes}} min",
  customOfferDetails: "Custom Offer Details",
  yourRequest: "Your request:",
  providerNotes: "Provider notes:",
  addonsSection: "Add-ons",
  addonFallback: "Add-on",
  productsSection: "Products",
  productFallback: "Product",
  pricePaymentSection: "Price & payment",
  providerLocation: "Provider location",
  salonLocation: "Salon location",
  openInMaps: "Open in Maps",
  openInMapsA11y: "Open address in Maps",
  salonLocationMissingBody:
    "Salon address is not loaded in the app yet. Check your confirmation email or message your provider for the exact address.",
  serviceAddress: "Service address",
  unitLabel: "Unit: {{value}}",
  buildingLabel: "Building: {{value}}",
  floorLabel: "Floor: {{value}}",
  accessLabel: "Access",
  gateLabel: "Gate: {{value}}",
  buzzerLabel: "Buzzer: {{value}}",
  doorLabel: "Door: {{value}}",
  parkingLabel: "Parking",
  landmarksLabel: "Landmarks",
  visitInstructionsLabel: "Visit instructions",
  serviceAddressPendingBody:
    "Your visit address will appear here once it is saved on the booking. If you are unsure, open this booking on the web or message your provider.",
  notesForProvider: "Notes for your provider",
  addressTbd: "Address TBD",
  calTitle: "Appointment with {{name}}",
  calHouseCall: "House call",
  calInSalon: "In-salon visit",
  calServiceLine: "{{name}} ({{minutes}} min)",
  calBookingLine: "Booking #{{number}}",
  rescheduleCta: "Reschedule",
  rescheduleA11y: "Reschedule booking",
  cancelBookingA11y: "Cancel booking",
  cancelBookingHint: "Double tap to cancel this appointment. Cancellation fees may apply.",
  yourReview: "Your review",
  noWrittenComment: "No written comment added.",
  editReview: "Edit Review",
  writeReview: "Write a Review",
  editReviewA11y: "Edit your review",
  writeReviewA11y: "Write a review",
  requestExpiredTitle: "Request expired",
  requestExpiredDefaultBody:
    "This request was not confirmed in time, so the appointment time was released.",
  bookAgain: "Book again",
  bookAgainCompleted: "Book Again",
  bookAgainA11y: "Book again with this provider",
  messageProvider: "Message Provider",
  messageProviderA11y: "Message {{name}}",
  messageProviderHint: "Start a chat with the provider about this booking",
  shareBookingA11y: "Share booking details",
  downloadReceiptA11y: "Download booking receipt",
  runningLateTitle: "Running late?",
  runningLateBody: "Choose how many minutes late you expect to be. The provider will be notified.",
  reportMinLateA11y: "Report {{minutes}} minutes late",
  minShort: "{{minutes}} min",
  cancelRunningLateA11y: "Cancel running late report",
  completionTitle: "Booking complete",
  completionBody: "You're all set. Thanks for booking with us.",
  loyaltyEarned: "You earned {{points}} loyalty points. They've been added to your balance.",
  writeReviewCta: "Write a review",
  maybeLater: "Maybe later",
  cancelReasonDefault: "Customer request",
  providerReply: "Provider reply",
  noComment: "No comment",
  editCta: "Edit",
});

// --- privacySharing ---
Object.assign(mobile.screens.privacySharing, {
  title: "Privacy Controls",
  subtitle: "Manage how your information is used and shared",
  toggleShowProfilePubliclyLabel: "Show my profile publicly",
  toggleShowProfilePubliclyDesc: "Allow other users to view your profile and basic information",
  toggleAllowProvidersSeeReviewsLabel: "Allow providers to see my reviews",
  toggleAllowProvidersSeeReviewsDesc: "Let service providers view reviews you've written",
  toggleShareBookingDataLabel: "Share booking data for recommendations",
  toggleShareBookingDataDesc: "Help us personalise your experience with smarter recommendations",
  toggleReceiveMarketingLabel: "Receive marketing communications",
  toggleReceiveMarketingDesc: "Get emails and notifications about promotions and new features",
  toggleAnalyticsConsentLabel: "Product analytics",
  toggleAnalyticsConsentDesc:
    "Help improve the app with usage analytics and optional session diagnostics while you are signed in. You can turn this off anytime.",
  popiaNote:
    "Your data is protected in accordance with the Protection of Personal Information Act (POPIA) and our Privacy Policy. You can change these settings at any time. Disabling data sharing may limit personalised recommendations.",
  privacyPolicyLink: "Privacy policy",
  termsLink: "Terms of service",
  cookiePolicyLink: "Cookie policy",
  ageSuitabilityLink: "Age suitability",
  deleteAccountSectionTitle: "Delete account",
  deleteAccountSectionBody:
    "Permanently delete your account and personal data. You will confirm with your password and by typing DELETE.",
  deleteAccountCta: "Delete account",
  deleteAccountA11y: "Delete account permanently",
});

// --- reviews screen ---
mobile.screens.reviews = {
  loadFailed: "Failed to load",
  emptyTitle: "No reviews yet",
  providerFallback: "Provider",
  noComment: "No comment",
  providerReply: "Provider reply",
  editCta: "Edit",
};

// --- languageScreen ---
Object.assign(mobile.screens.languageScreen, {
  introCardTitle: "Language & region",
  introCardBodyPrefix: " under Account is the main place to set language, currency, and timezone. This screen is only the language list (for shortcuts); it writes the same ",
  introCardBodyField: "preferred_language",
  introCardBodySuffix: " field via ",
  introCardBodyApi: "/api/me/preferences",
  introCardBodyEnd: ".",
  openPreferencesCta: "Open Language & region",
  openPreferencesA11y: "Open Language and region settings",
  chooseLanguageSubtitle: "Choose your preferred language. The app interface updates immediately.",
  selectLanguageA11y: "Select {{name}}",
  providerContentNote: "Some content from service providers may remain in its original language.",
});

// --- components ---
Object.assign(mobile.components, {
  offlineBar: { noConnection: "No internet connection" },
  wrongApp: {
    adminHeading: "Admin access",
    adminBody:
      "This account has admin access. Open the web admin console to manage the platform — customer-app features are limited for safety.",
    providerHeading: "Open the Provider app",
    providerBody:
      "This account is registered as a provider. Tap below to jump into the Beautonomi Partner app, or continue on the web customer portal to book services.",
    onboardingHeading: "Finish setting up your business",
    onboardingBody:
      "Your provider onboarding isn't complete yet. Open the Partner app to finish setup — after that you can still book services from the web.",
    otherHeading: "Wrong app",
    otherBody:
      "This account can't be used in the Customer app. Please sign in with your customer account, or open the app that matches your role.",
    openPartnerApp: "Open Partner app",
    installPartnerApp: "Install Partner app",
    continueOnWeb: "Continue on web",
    openPartnerA11y: "Open Partner app",
    installPartnerA11y: "Install Partner app",
    continueOnWebA11y: "Continue on web",
    bookOnWebInstead: "Book on web instead",
    openAdminWeb: "Open Admin on web",
    openAdminWebA11y: "Open Admin on web",
    signOut: "Sign out",
    signOutA11y: "Sign out",
  },
  installAppBanner: {
    body: "For notifications and a faster checkout, use the Beautonomi app.",
    getApp: "Get app",
    dismissA11y: "Dismiss install banner",
  },
  saveAddressModal: {
    title: "Save this location?",
    subtitle: "Store it for quick access next time (e.g. Home, Work).",
    addressLabel: "Address",
    labelHeading: "Label",
    labelHome: "Home",
    labelWork: "Work",
    labelOther: "Other",
    labelA11y: "Label: {{label}}",
    saveAndUse: "Save & use",
    saveAndUseA11y: "Save and use this address",
    justUse: "Just use for now",
    justUseA11y: "Use without saving",
  },
  errorBoundary: {
    title: "Something went wrong",
    body: "An unexpected error occurred. Please try again.",
    a11y: "Application error occurred",
    retry: "Tap to retry",
    retryA11y: "Retry",
    retryHint: "Tap to reload the application",
  },
  gateLoading: {
    defaultA11y: "Loading",
    checkingAccount: "Checking account…",
    checkingAccess: "Checking access…",
  },
});

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
      console.warn(`MISSING in ${rel}:`, from.slice(0, 60));
    }
  }
  fs.writeFileSync(p, s);
  console.log(`${rel}: ${n} replacements`);
}

// booking-detail.tsx — details tab + modals + misc
patch("apps/customer/app/(app)/booking-detail.tsx", [
  ['reason: reason.trim() || "Customer request"', "reason: reason.trim() || bd(\"cancelReasonDefault\")"],
  ['title: "Pay remaining balance"', "title: bd(\"payRemainingBalanceTitle\")"],
  ['<Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 4 }}>Visit type</Text>', "<Text style={{ fontSize: 12, color: Colors.gray[500], marginBottom: 4 }}>{bd(\"visitTypeLabel\")}</Text>"],
  ['<Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>House call</Text>', "<Text style={{ fontSize: 16, fontWeight: \"600\", color: Colors.gray[900] }}>{bd(\"houseCallTitle\")}</Text>"],
  [`Your professional travels to the address below. Tracking and arrival verification (when your provider
                  arrives) appear on the Tracking tab.`, "{bd(\"houseCallBody\")}"],
  ["A travel fee is included in your price breakdown below.", "{bd(\"houseCallTravelFeeHint\")}"],
  ['<Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>In-salon visit</Text>', "<Text style={{ fontSize: 16, fontWeight: \"600\", color: Colors.gray[900] }}>{bd(\"inSalonTitle\")}</Text>"],
  [`{"You go to the provider's salon or workspace. Use the address below for directions and parking."}`, "{bd(\"inSalonBody\")}"],
  ['<Text style={{ fontSize: 12, color: Colors.gray[500] }}>Group booking</Text>', "<Text style={{ fontSize: 12, color: Colors.gray[500] }}>{bd(\"groupBookingLabel\")}</Text>"],
  [" paid for the whole group", " {bd(\"groupPaidSummary\", { amount: formatMoney(groupPaymentSummary.amount_paid, groupPaymentSummary.currency) }).replace(/^\\{\\{amount\\}\\}\\s*/, \"\")}"],
  ['accessibilityLabel="View group booking details"', "accessibilityLabel={bd(\"viewGroupDetailsA11y\")}"],
  ['<Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[900] }}>View group details</Text>', "<Text style={{ fontSize: 13, fontWeight: \"600\", color: Colors.gray[900] }}>{bd(\"viewGroupDetails\")}</Text>"],
  ['{provider?.business_name || "Provider"}', "{provider?.business_name || bd(\"providerFallback\")}"],
  ['booking.status === "no_show" ? "No show" : booking.status === "in_progress" || booking.status === "started" ? "In progress" : booking.status === "checked_in" ? "Checked in" : booking.status === "pending_payment" ? "Payment pending" : booking.status === "pending" ? "Awaiting confirmation" : lifecycleDisplay.label', 'booking.status === "no_show" ? bd("statusNoShow") : booking.status === "in_progress" || booking.status === "started" ? bd("statusServiceInProgress") : booking.status === "checked_in" ? bd("statusCheckedIn") : booking.status === "pending_payment" ? bd("statusPaymentPending") : booking.status === "pending" ? bd("statusAwaitingConfirmation") : lifecycleDisplay.label'],
  ['<Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Services</Text>', "<Text style={{ fontSize: 14, fontWeight: \"600\", color: Colors.gray[900], marginBottom: 8 }}>{bd(\"servicesSection\")}</Text>"],
  ["?? `Service ${i + 1}`", "?? bd(\"serviceLineFallback\", { index: i + 1 })"],
  ["{duration} min", "{bd(\"durationMinShort\", { minutes: duration })}"],
  ["with {staffName}", "{bd(\"withStaff\", { name: staffName })}"],
  ['Custom Offer Details', "{bd(\"customOfferDetails\")}"],
  ['<Text style={{ fontWeight: "600" }}>Your request:</Text>', "<Text style={{ fontWeight: \"600\" }}>{bd(\"yourRequest\")}</Text>"],
  ['<Text style={{ fontWeight: "600" }}>Provider notes:</Text>', "<Text style={{ fontWeight: \"600\" }}>{bd(\"providerNotes\")}</Text>"],
  ['<Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Add-ons</Text>', "<Text style={{ fontSize: 14, fontWeight: \"600\", color: Colors.gray[900], marginBottom: 8 }}>{bd(\"addonsSection\")}</Text>"],
  ['?? "Add-on"', "?? bd(\"addonFallback\")"],
  ['<Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Products</Text>', "<Text style={{ fontSize: 14, fontWeight: \"600\", color: Colors.gray[900], marginBottom: 8 }}>{bd(\"productsSection\")}</Text>"],
  ['?? "Product"', "?? bd(\"productFallback\")"],
  ['<Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Price & payment</Text>', "<Text style={{ fontSize: 14, fontWeight: \"600\", color: Colors.gray[900], marginBottom: 8 }}>{bd(\"pricePaymentSection\")}</Text>"],
  ['{isAtHome ? "Provider location" : "Salon location"}', "{isAtHome ? bd(\"providerLocation\") : bd(\"salonLocation\")}"],
  ['accessibilityLabel="Open address in Maps"', "accessibilityLabel={bd(\"openInMapsA11y\")}"],
  ['<Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>Open in Maps</Text>', "<Text style={{ fontSize: 14, fontWeight: \"600\", color: Colors.primary }}>{bd(\"openInMaps\")}</Text>"],
  ['Salon address is not loaded in the app yet. Check your confirmation email or message your provider for the exact address.', "{bd(\"salonLocationMissingBody\")}"],
  ['<Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>Service address</Text>', "<Text style={{ fontSize: 14, fontWeight: \"600\", color: Colors.gray[900], marginBottom: 8 }}>{bd(\"serviceAddress\")}</Text>"],
  ['<Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 6 }}>Unit: {String(a.apartment_unit)}</Text>', "<Text style={{ fontSize: 13, color: Colors.gray[600], marginTop: 6 }}>{bd(\"unitLabel\", { value: String(a.apartment_unit) })}</Text>"],
  ['<Text style={{ fontSize: 13, color: Colors.gray[600] }}>Building: {String(a.building_name)}</Text>', "<Text style={{ fontSize: 13, color: Colors.gray[600] }}>{bd(\"buildingLabel\", { value: String(a.building_name) })}</Text>"],
  ['<Text style={{ fontSize: 13, color: Colors.gray[600] }}>Floor: {String(a.floor_number)}</Text>', "<Text style={{ fontSize: 13, color: Colors.gray[600] }}>{bd(\"floorLabel\", { value: String(a.floor_number) })}</Text>"],
  ['<Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[700], marginBottom: 4 }}>Access</Text>', "<Text style={{ fontSize: 12, fontWeight: \"600\", color: Colors.gray[700], marginBottom: 4 }}>{bd(\"accessLabel\")}</Text>"],
  ['{ac.gate?.trim() ? <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Gate: {ac.gate}</Text> : null}', "{ac.gate?.trim() ? <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{bd(\"gateLabel\", { value: ac.gate })}</Text> : null}"],
  ['{ac.buzzer?.trim() ? <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Buzzer: {ac.buzzer}</Text> : null}', "{ac.buzzer?.trim() ? <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{bd(\"buzzerLabel\", { value: ac.buzzer })}</Text> : null}"],
  ['{ac.door?.trim() ? <Text style={{ fontSize: 13, color: Colors.gray[600] }}>Door: {ac.door}</Text> : null}', "{ac.door?.trim() ? <Text style={{ fontSize: 13, color: Colors.gray[600] }}>{bd(\"doorLabel\", { value: ac.door })}</Text> : null}"],
  ['<Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>Parking</Text>', "<Text style={{ fontSize: 12, fontWeight: \"600\", color: Colors.gray[700] }}>{bd(\"parkingLabel\")}</Text>"],
  ['<Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>Landmarks</Text>', "<Text style={{ fontSize: 12, fontWeight: \"600\", color: Colors.gray[700] }}>{bd(\"landmarksLabel\")}</Text>"],
  ['<Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[700] }}>Visit instructions</Text>', "<Text style={{ fontSize: 12, fontWeight: \"600\", color: Colors.gray[700] }}>{bd(\"visitInstructionsLabel\")}</Text>"],
  ["Your visit address will appear here once it is saved on the booking. If you are unsure, open this booking on the web or message your provider.", "{bd(\"serviceAddressPendingBody\")}"],
  ['<Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900], marginBottom: 6 }}>Notes for your provider</Text>', "<Text style={{ fontSize: 14, fontWeight: \"600\", color: Colors.gray[900], marginBottom: 6 }}>{bd(\"notesForProvider\")}</Text>"],
  [': "Address TBD"', ': bd("addressTbd")'],
  ['`Appointment with ${provider?.business_name ?? "Beautonomi"}`', "bd(\"calTitle\", { name: provider?.business_name ?? bd(\"brandFallback\") })"],
  ['const visitLine = isAtHome ? "House call" : "In-salon visit"', "const visitLine = isAtHome ? bd(\"calHouseCall\") : bd(\"calInSalon\")"],
  ['?? "Service"} (${s.duration_minutes ?? 0} min)`', "?? bd(\"serviceFallback\")} (${s.duration_minutes ?? 0} min)`"],
  ['accessibilityLabel="Reschedule booking"', "accessibilityLabel={bd(\"rescheduleA11y\")}"],
  ['<Text style={{ marginLeft: 8, fontWeight: "500", color: Colors.gray[700] }}>Reschedule</Text>', "<Text style={{ marginLeft: 8, fontWeight: \"500\", color: Colors.gray[700] }}>{bd(\"rescheduleCta\")}</Text>"],
  ['accessibilityLabel="Cancel booking"', "accessibilityLabel={bd(\"cancelBookingA11y\")}"],
  ['accessibilityHint="Double tap to cancel this appointment. Cancellation fees may apply."', "accessibilityHint={bd(\"cancelBookingHint\")}"],
  ['<Text style={{ fontWeight: "500", color: "#B91C1C" }}>Cancel</Text>', "<Text style={{ fontWeight: \"500\", color: \"#B91C1C\" }}>{bd(\"cancel\")}</Text>"],
  ['<Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 4 }}>Your review</Text>', "<Text style={{ fontSize: 13, color: Colors.gray[500], marginBottom: 4 }}>{bd(\"yourReview\")}</Text>"],
  ['<Text style={{ fontSize: 13, color: Colors.gray[500] }}>No written comment added.</Text>', "<Text style={{ fontSize: 13, color: Colors.gray[500] }}>{bd(\"noWrittenComment\")}</Text>"],
  ['accessibilityLabel={myReview ? "Edit your review" : "Write a review"}', "accessibilityLabel={myReview ? bd(\"editReviewA11y\") : bd(\"writeReviewA11y\")}"],
  ['{myReview ? "Edit Review" : "Write a Review"}', "{myReview ? bd(\"editReview\") : bd(\"writeReview\")}"],
  ['<Text style={{ fontWeight: "600", color: Colors.gray[900] }}>Request expired</Text>', "<Text style={{ fontWeight: \"600\", color: Colors.gray[900] }}>{bd(\"requestExpiredTitle\")}</Text>"],
  [': "This request was not confirmed in time, so the appointment time was released."', ': bd("requestExpiredDefaultBody")'],
  ['accessibilityLabel="Book again with this provider"', "accessibilityLabel={bd(\"bookAgainA11y\")}"],
  ['<Text style={{ fontWeight: "600", color: Colors.white }}>Book again</Text>', "<Text style={{ fontWeight: \"600\", color: Colors.white }}>{bd(\"bookAgain\")}</Text>"],
  ['<Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Book Again</Text>', "<Text style={{ fontWeight: \"500\", color: Colors.gray[700] }}>{bd(\"bookAgainCompleted\")}</Text>"],
  ['provider_name: provider.business_name || "Provider"', "provider_name: provider.business_name || bd(\"providerFallback\")"],
  ['accessibilityLabel={`Message ${provider.business_name || "provider"}`}', "accessibilityLabel={bd(\"messageProviderA11y\", { name: provider.business_name || bd(\"providerFallback\") })}"] ,
  ['accessibilityHint="Start a chat with the provider about this booking"', "accessibilityHint={bd(\"messageProviderHint\")}"],
  ['Message Provider', "{bd(\"messageProvider\")}"],
  ['accessibilityLabel="Share booking details"', "accessibilityLabel={bd(\"shareBookingA11y\")}"],
  ['<Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Share</Text>', "<Text style={{ fontWeight: \"500\", color: Colors.gray[700] }}>{bd(\"share\")}</Text>"],
  ['accessibilityLabel="Download booking receipt"', "accessibilityLabel={bd(\"downloadReceiptA11y\")}"],
  ['<Text style={{ fontWeight: "500", color: Colors.gray[700] }}>Download</Text>', "<Text style={{ fontWeight: \"500\", color: Colors.gray[700] }}>{bd(\"download\")}</Text>"],
  ['accessibilityLabel="Help"', "accessibilityLabel={bd(\"helpA11y\")}"],
  ['<Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "500" }}>Help</Text>', "<Text style={{ fontSize: 14, color: Colors.primary, fontWeight: \"500\" }}>{bd(\"help\")}</Text>"],
  ['Running late?', "{bd(\"runningLateTitle\")}"],
  ["Choose how many minutes late you expect to be. The provider will be notified.", "{bd(\"runningLateBody\")}"],
  ['accessibilityLabel={`Report ${mins} minutes late`}', "accessibilityLabel={bd(\"reportMinLateA11y\", { minutes: mins })}"],
  ['<Text style={{ fontWeight: "600", color: Colors.gray[800] }}>{mins} min</Text>', "<Text style={{ fontWeight: \"600\", color: Colors.gray[800] }}>{bd(\"minShort\", { minutes: mins })}</Text>"],
  ['accessibilityLabel="Cancel running late report"', "accessibilityLabel={bd(\"cancelRunningLateA11y\")}"],
  ['Booking complete', "{bd(\"completionTitle\")}"],
  ["You're all set. Thanks for booking with us.", "{bd(\"completionBody\")}"],
  ["You earned {booking.loyalty_points_earned} loyalty points. They've been added to your balance.", "{bd(\"loyaltyEarned\", { points: booking.loyalty_points_earned })}"],
  ['<Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Write a review</Text>', "<Text style={{ color: \"#fff\", fontWeight: \"600\", fontSize: 16 }}>{bd(\"writeReviewCta\")}</Text>"],
  ['<Text style={{ color: Colors.gray[600], fontWeight: "500", fontSize: 15 }}>Maybe later</Text>', "<Text style={{ color: Colors.gray[600], fontWeight: \"500\", fontSize: 15 }}>{bd(\"maybeLater\")}</Text>"],
]);

// Fix group paid summary line manually if patch mangled - we'll fix in follow-up if needed

// reviews.tsx
{
  const p = path.join(root, "apps/customer/app/(app)/account-settings/reviews.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { Colors } from "@/constants/colors";',
      'import { Colors } from "@/constants/colors";\nimport { useTranslation } from "@beautonomi/i18n";',
    );
    s = s.replace(
      "export default function ReviewsScreen() {",
      "export default function ReviewsScreen() {\n  const { t } = useTranslation();\n  const rv = (key: string, opts?: Record<string, string | number>) =>\n    t(`customer.mobile.screens.reviews.${key}`, opts) as string;",
    );
    s = s.replace('"Failed to load"', "rv(\"loadFailed\")");
    s = s.replace('empty={{ title: "No reviews yet" }}', "empty={{ title: rv(\"emptyTitle\") }}");
    s = s.replace('"Provider"', "rv(\"providerFallback\")");
    s = s.replace('"No comment"', "rv(\"noComment\")");
    s = s.replace("Provider reply", "{rv(\"providerReply\")}");
    s = s.replace('>Edit</Text>', ">{rv(\"editCta\")}</Text>");
    fs.writeFileSync(p, s);
    console.log("reviews.tsx patched");
  }
}

// privacy-and-sharing.tsx
{
  const p = path.join(root, "apps/customer/app/(app)/account-settings/privacy-and-sharing.tsx");
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(
    `const PRIVACY_TOGGLES: {
  key: keyof PrivacySettings;
  label: string;
  description: string;
}[] = [
  {
    key: "show_profile_publicly",
    label: "Show my profile publicly",
    description: "Allow other users to view your profile and basic information",
  },
  {
    key: "allow_providers_see_reviews",
    label: "Allow providers to see my reviews",
    description: "Let service providers view reviews you've written",
  },
  {
    key: "share_booking_data",
    label: "Share booking data for recommendations",
    description: "Help us personalise your experience with smarter recommendations",
  },
  {
    key: "receive_marketing",
    label: "Receive marketing communications",
    description: "Get emails and notifications about promotions and new features",
  },
  {
    key: "analytics_consent",
    label: "Product analytics",
    description:
      "Help improve the app with usage analytics and optional session diagnostics while you are signed in. You can turn this off anytime.",
  },
];`,
    `function buildPrivacyToggles(t: (key: string) => string): {
  key: keyof PrivacySettings;
  label: string;
  description: string;
}[] {
  return [
    {
      key: "show_profile_publicly",
      label: t("customer.mobile.screens.privacySharing.toggleShowProfilePubliclyLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleShowProfilePubliclyDesc"),
    },
    {
      key: "allow_providers_see_reviews",
      label: t("customer.mobile.screens.privacySharing.toggleAllowProvidersSeeReviewsLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleAllowProvidersSeeReviewsDesc"),
    },
    {
      key: "share_booking_data",
      label: t("customer.mobile.screens.privacySharing.toggleShareBookingDataLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleShareBookingDataDesc"),
    },
    {
      key: "receive_marketing",
      label: t("customer.mobile.screens.privacySharing.toggleReceiveMarketingLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleReceiveMarketingDesc"),
    },
    {
      key: "analytics_consent",
      label: t("customer.mobile.screens.privacySharing.toggleAnalyticsConsentLabel"),
      description: t("customer.mobile.screens.privacySharing.toggleAnalyticsConsentDesc"),
    },
  ];
}`,
  );
  s = s.replace(
    "export default function PrivacyAndSharingScreen() {\n  const { t } = useTranslation();",
    "export default function PrivacyAndSharingScreen() {\n  const { t } = useTranslation();\n  const PRIVACY_TOGGLES = buildPrivacyToggles(t);",
  );
  const psPairs = [
    ['>Privacy Controls</Text>', ">{t(\"customer.mobile.screens.privacySharing.title\")}</Text>"],
    ["Manage how your information is used and shared", "{t(\"customer.mobile.screens.privacySharing.subtitle\")}"],
    ["Your data is protected in accordance with the Protection of Personal Information", "{t(\"customer.mobile.screens.privacySharing.popiaNote\")}"],
    ["Act (POPIA) and our Privacy Policy. You can change these settings at any time.\n            Disabling data sharing may limit personalised recommendations.", ""],
    [">Privacy policy</Text>", ">{t(\"customer.mobile.screens.privacySharing.privacyPolicyLink\")}</Text>"],
    [">Terms of service</Text>", ">{t(\"customer.mobile.screens.privacySharing.termsLink\")}</Text>"],
    [">Cookie policy</Text>", ">{t(\"customer.mobile.screens.privacySharing.cookiePolicyLink\")}</Text>"],
    [">Age suitability</Text>", ">{t(\"customer.mobile.screens.privacySharing.ageSuitabilityLink\")}</Text>"],
    [">Delete account</Text>", ">{t(\"customer.mobile.screens.privacySharing.deleteAccountSectionTitle\")}</Text>"],
    ["Permanently delete your account and personal data. You will confirm with your password and by typing\n            DELETE.", "{t(\"customer.mobile.screens.privacySharing.deleteAccountSectionBody\")}"],
    ['accessibilityLabel="Delete account permanently"', "accessibilityLabel={t(\"customer.mobile.screens.privacySharing.deleteAccountA11y\")}"],
    ['<Text style={{ color: "#b91c1c", fontWeight: "700", fontSize: 16 }}>Delete account</Text>', "<Text style={{ color: \"#b91c1c\", fontWeight: \"700\", fontSize: 16 }}>{t(\"customer.mobile.screens.privacySharing.deleteAccountCta\")}</Text>"],
  ];
  for (const [from, to] of psPairs) {
    if (s.includes(from)) s = s.split(from).join(to);
  }
  fs.writeFileSync(p, s);
  console.log("privacy-and-sharing.tsx patched");
}

console.log("Run: node packages/i18n/scripts/merge-en-into-locales.mjs && pnpm i18n:check");
