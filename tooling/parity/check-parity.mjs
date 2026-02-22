#!/usr/bin/env node
/**
 * Parity checker – compares web inventory screen_ids vs mobile implemented screens.
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
  book: "(app)/book.tsx",
  book_continue: "(app)/book-checkout.tsx",
  bookings: "(app)/(tabs)/bookings.tsx",
  booking_detail: "(app)/booking-detail.tsx",
  booking_reschedule: "(app)/book.tsx",
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
  account_business: "(app)/account-settings/business.tsx",
  gift_card: "(app)/gift-card-purchase.tsx",
  login: "(auth)/login.tsx",
  signup: "(auth)/login.tsx",
  onboarding: "(auth)/login.tsx",
};

function fileExists(relPath) {
  const fullPath = path.join(CUSTOMER_APP, relPath);
  return fs.existsSync(fullPath);
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
}

main();
