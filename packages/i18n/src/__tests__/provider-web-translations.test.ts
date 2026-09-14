import { describe, expect, it } from "vitest";
import af from "../locales/af.json";
import ar from "../locales/ar.json";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import sw from "../locales/sw.json";
import zu from "../locales/zu.json";

type Json = Record<string, unknown>;

function get(obj: Json, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Json)[part];
  }
  return cur;
}

const SAMPLE_KEYS = [
  "web.provider.sidebar.items.dashboard",
  "web.provider.sidebar.items.calendar",
  "web.provider.bookings.pageTitle",
  "web.provider.bookings.emptyTitle",
  "web.provider.onboarding.toast.submittedApplication",
  "web.provider.finance.pageTitle",
  "web.provider.frontDesk.queueTabs.all",
  "web.provider.frontDesk.queueTabs.inService",
  "web.provider.topbar.menu.signOut",
  "web.provider.common.saveChanges",
] as const;

describe("provider web Wave A translations", () => {
  for (const key of SAMPLE_KEYS) {
    it(`en defines ${key}`, () => {
      expect(typeof get(en as Json, key)).toBe("string");
      expect(String(get(en as Json, key)).length).toBeGreaterThan(0);
    });
  }

  it("uses real Afrikaans for sidebar dashboard", () => {
    const enVal = get(en as Json, "web.provider.sidebar.items.dashboard");
    const afVal = get(af as Json, "web.provider.sidebar.items.dashboard");
    expect(afVal).toBeTruthy();
    expect(afVal).not.toBe(enVal);
  });

  it("uses real isiZulu for bookings empty state", () => {
    const enVal = get(en as Json, "web.provider.bookings.emptyTitle");
    const zuVal = get(zu as Json, "web.provider.bookings.emptyTitle");
    expect(zuVal).toBeTruthy();
    expect(zuVal).not.toBe(enVal);
  });

  it("uses real French for front-desk queue tab", () => {
    const enVal = get(en as Json, "web.provider.frontDesk.queueTabs.readyToPay");
    const frVal = get(fr as Json, "web.provider.frontDesk.queueTabs.readyToPay");
    expect(frVal).toBeTruthy();
    expect(frVal).not.toBe(enVal);
  });

  it("uses real Arabic for sign out (RTL locale)", () => {
    const enVal = get(en as Json, "web.provider.topbar.menu.signOut");
    const arVal = get(ar as Json, "web.provider.topbar.menu.signOut");
    expect(arVal).toBeTruthy();
    expect(arVal).not.toBe(enVal);
  });

  it("uses real Swahili for finance page title", () => {
    const enVal = get(en as Json, "web.provider.finance.pageTitle");
    const swVal = get(sw as Json, "web.provider.frontDesk.queueTabs.all");
    expect(get(sw as Json, "web.provider.finance.pageTitle")).toBeTruthy();
    expect(get(sw as Json, "web.provider.finance.pageTitle")).not.toBe(enVal);
    expect(swVal).toBeTruthy();
  });
});
