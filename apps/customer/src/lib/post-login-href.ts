import type { Href } from "expo-router";

/** Safe post-auth navigation (blocks open redirects). Parses deep-link-style paths with query strings. */
export function resolvePostLoginHref(returnTo: string | string[] | undefined): Href {
  const raw = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  if (!raw || typeof raw !== "string") return "/(app)/(tabs)/home";
  const t = raw.trim();
  if (!t.startsWith("/(app)/") && !t.startsWith("/(auth)/")) return "/(app)/(tabs)/home";
  if (t.startsWith("/(app)/book/continue")) {
    const q = t.includes("?") ? t.split("?")[1] : "";
    const sp = new URLSearchParams(q);
    const hid = sp.get("hold_id");
    if (hid) {
      const p: Record<string, string> = { hold_id: hid };
      const rid = sp.get("reschedule_booking_id");
      if (rid) p.reschedule_booking_id = rid;
      return { pathname: "/(app)/book/continue", params: p };
    }
    return "/(app)/(tabs)/home";
  }
  if (t.startsWith("/(app)/book-checkout")) {
    const q = t.includes("?") ? t.split("?")[1] : "";
    const sp = new URLSearchParams(q);
    const hid = sp.get("hold_id");
    if (hid) {
      const p: Record<string, string> = { hold_id: hid };
      const rid = sp.get("reschedule_booking_id");
      if (rid) p.reschedule_booking_id = rid;
      return { pathname: "/(app)/book-checkout", params: p };
    }
    return "/(app)/(tabs)/home";
  }
  if (t.startsWith("/(app)/(tabs)/shop/product-checkout") || t.startsWith("/(app)/product-checkout")) {
    const q = t.includes("?") ? t.split("?")[1] : "";
    const pid = new URLSearchParams(q).get("provider_id");
    if (pid) return { pathname: "/(app)/(tabs)/shop/product-checkout", params: { provider_id: pid } };
  }
  if (t.startsWith("/(app)/product-detail")) {
    const q = t.includes("?") ? t.split("?")[1] : "";
    const id = new URLSearchParams(q).get("id");
    if (id) return { pathname: "/(app)/product-detail", params: { id } };
  }
  return t as Href;
}
