#!/usr/bin/env node
/**
 * Parity checker:
 * - Customer app: `screen_id` → expected route file under `apps/customer/app`.
 * - Provider app: minimal core file smoke list under `apps/provider/app`.
 * Usage: pnpm parity:check
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const CUSTOMER_APP = path.join(ROOT, "apps/customer/app");

/** screen_id -> expected file path relative to apps/customer/app */
const MOBILE_ROUTE_MAP = {
  home: "(app)/(tabs)/home.tsx",
  explore: "(app)/(tabs)/explore.tsx",
  explore_post: "(app)/explore-post.tsx",
  saved: "(app)/(tabs)/saved.tsx",
  search: "(app)/(tabs)/search.tsx",
  partner_profile: "(app)/partner-profile.tsx",
  partner_gallery: "(app)/partner-profile.tsx",
  /** Nested stack: `(app)/book/index.tsx`, `book/l/[linkSlug]`, `book/continue` (see `(app)/book/_layout.tsx`). */
  book: "(app)/book/index.tsx",
  book_continue: "(app)/book-checkout.tsx",
  bookings: "(app)/(tabs)/bookings.tsx",
  booking_detail: "(app)/booking-detail.tsx",
  /** Resume / reschedule entry (`reschedule_booking_id` on `book/continue` — see `(app)/_layout.tsx`). */
  booking_reschedule: "(app)/book/continue.tsx",
  booking_review: "(app)/review-write.tsx",
  chats: "(app)/(tabs)/chats.tsx",
  profile: "(app)/(tabs)/profile.tsx",
  account_settings: "(app)/account-settings/index.tsx",
  account_personal_info: "(app)/account-settings/personal-info.tsx",
  account_wishlists: "(app)/account-settings/wishlists.tsx",
  account_messages: "(app)/account-settings/messages.tsx",
  account_notifications: "(app)/account-settings/notifications.tsx",
  account_payments: "(app)/account-settings/payments.tsx",
  account_addresses: "(app)/account-settings/addresses.tsx",
  account_preferences: "(app)/account-settings/preferences.tsx",
  account_reviews: "(app)/account-settings/reviews.tsx",
  account_custom_requests: "(app)/account-settings/custom-requests.tsx",
  account_membership: "(app)/account-settings/membership.tsx",
  account_loyalty: "(app)/account-settings/loyalty.tsx",
  account_referrals: "(app)/account-settings/referrals.tsx",
  gift_card: "(app)/gift-card-purchase.tsx",
  login: "(auth)/login.tsx",
  signup: "(auth)/signup.tsx",
  /** No dedicated onboarding route; auth entry covers first-run. */
  onboarding: "(auth)/login.tsx",
};

function fileExists(relPath) {
  const fullPath = path.join(CUSTOMER_APP, relPath);
  return fs.existsSync(fullPath);
}

const PROVIDER_APP = path.join(ROOT, "apps/provider/app");

/** Minimal provider-app smoke paths (tabs + auth) — extend when formalizing provider↔web parity. */
const PROVIDER_ROUTE_FILES = [
  "(app)/(tabs)/dashboard.tsx",
  "(app)/(tabs)/bookings/index.tsx",
  "(app)/(tabs)/more/index.tsx",
  "(app)/(tabs)/more/bookings/index.tsx",
  "(app)/(tabs)/more/finance-hub.tsx",
  "(app)/(tabs)/more/settings/yoco-devices.tsx",
  "(auth)/login.tsx",
];

function fileExistsUnder(root, relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function main() {
  const implemented = [];
  const missing = [];

  for (const [screenId, relPath] of Object.entries(MOBILE_ROUTE_MAP)) {
    if (fileExists(relPath)) {
      implemented.push(screenId);
    } else {
      missing.push(screenId);
    }
  }

  const seen = new Set();
  const uniqueImplemented = implemented.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });

  console.log("=== Mobile Parity Check ===\n");
  console.log("Implemented:", uniqueImplemented.length);
  console.log("Missing:", missing.length);
  console.log("Total contract screens:", Object.keys(MOBILE_ROUTE_MAP).length);
  console.log("");

  if (missing.length > 0) {
    console.log("Missing screens:");
    missing.forEach((s) => console.log("  -", s));
    console.log("");
    process.exit(1);
  } else {
    console.log("All contract screens have mobile implementations.");
  }

  console.log("\n=== Provider app core files ===\n");
  const providerMissing = PROVIDER_ROUTE_FILES.filter((f) => !fileExistsUnder(PROVIDER_APP, f));
  if (providerMissing.length > 0) {
    console.log("Missing provider routes:");
    providerMissing.forEach((f) => console.log("  -", f));
    console.log("");
    process.exit(1);
  }
  console.log("Provider core:", PROVIDER_ROUTE_FILES.length, "files OK.");
}

main();
