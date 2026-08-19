/**
 * Guest browse policy for Apple Guideline 5.1.1(v).
 * Browse routes work without an account; account actions require sign-in.
 */
import { router } from "expo-router";
import type { Href } from "expo-router";

export type GuestRouteKind = "browse" | "account_tab" | "account_action";

/** Path segments that require sign-in (checkout, book, settings, etc.). */
const ACCOUNT_ACTION_SEGMENTS = [
  "/book",
  "/book-checkout",
  "/product-checkout",
  "/shop/product-checkout",
  "/(tabs)/shop/product-checkout",
  "/gift-card-purchase",
  "/account-settings",
  "/onboarding",
  "/chat",
  "/custom-request",
  "/product-orders",
  "/product-order-detail",
  "/request-return",
  "/my-returns",
  "/group-booking",
  "/membership-paystack",
  "/paystack-callback",
  "/review-write",
  "/notifications",
  "/safety",
] as const;

/** Tab routes that show signed-out empty states instead of redirecting to login. */
const ACCOUNT_TAB_SEGMENTS = [
  "/(tabs)/bookings",
  "/(tabs)/cart",
  "/(tabs)/chats",
  "/(tabs)/profile",
  "/(tabs)/support-tickets",
  "/(tabs)/saved",
] as const;

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  const withoutQuery = trimmed.split("?")[0] ?? trimmed;
  let p = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  if (p.startsWith("/(app)")) {
    p = p.slice("/(app)".length) || "/";
  }
  if (!p.startsWith("/")) p = `/${p}`;
  return p.replace(/\/+$/, "") || "/";
}

export function classifyGuestPath(path: string): GuestRouteKind {
  const p = normalizePath(path);

  for (const seg of ACCOUNT_ACTION_SEGMENTS) {
    if (p === seg || p.startsWith(`${seg}/`)) {
      return "account_action";
    }
  }

  // List tab is signed-out friendly; create/detail routes require sign-in.
  if (p.startsWith("/(tabs)/support-tickets/") && p !== "/(tabs)/support-tickets") {
    return "account_action";
  }

  for (const seg of ACCOUNT_TAB_SEGMENTS) {
    if (p === seg || p.startsWith(`${seg}/`)) {
      return "account_tab";
    }
  }

  return "browse";
}

export function requiresCustomerLogin(path: string): boolean {
  return classifyGuestPath(path) === "account_action";
}

/** Routes that force onboarding before access (book, checkout, account mutations). */
export function requiresOnboardingBeforeAccess(path: string): boolean {
  const p = normalizePath(path);
  if (p.startsWith("/book") || p.includes("checkout")) return true;
  if (p.startsWith("/account-settings")) return true;
  if (p.startsWith("/onboarding")) return true;
  if (p.startsWith("/chat")) return true;
  if (p.startsWith("/product-orders") || p.startsWith("/product-order")) return true;
  if (p.startsWith("/gift-card")) return true;
  if (p.startsWith("/custom-request")) return true;
  if (p.startsWith("/(tabs)/cart") || p === "/cart") return true;
  if (p.startsWith("/(tabs)/chats") || p === "/chats") return true;
  return false;
}

export function toAppReturnTo(path: string): string {
  const p = path.trim();
  if (!p) return "/(app)/(tabs)/home";
  if (p.startsWith("/(app)")) return p;
  const normalized = normalizePath(p);
  if (normalized === "/") return "/(app)/(tabs)/home";
  return `/(app)${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
}

export function pushCustomerLogin(returnTo: string): void {
  router.push({
    pathname: "/(auth)/login",
    params: { return_to: returnTo },
  } as Href);
}

export function replaceCustomerLogin(returnTo: string): void {
  router.replace({
    pathname: "/(auth)/login",
    params: { return_to: returnTo },
  } as Href);
}
