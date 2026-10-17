import { describe, expect, it } from "vitest";
import {
  getBookingSupportPrompt,
  getProductOrderSupportPrompt,
} from "../../booking/bookingSupportContext";
import {
  SUPPORT_TICKET_CATEGORY_GROUPS_RICH,
  humanizeCategoryValue,
  isSelectableForAudience,
  isSelectableSupportTicketCategory,
  labelForSupportTicketCategory,
  listCategoriesForAudience,
  parseUserSubmittedCategory,
  resolveGroupFilter,
  searchCategories,
  isSafetySupportCategory,
} from "../ticket-categories";

const API_CONTEXT_TYPES = new Set([
  "booking",
  "product_order",
  "gift_card",
  "payment",
  "provider_onboarding",
  "account",
  "technical",
  "other",
]);

describe("ticket-categories catalog", () => {
  it("has unique values and valid context types", () => {
    const values = new Set<string>();
    for (const g of SUPPORT_TICKET_CATEGORY_GROUPS_RICH) {
      for (const item of g.items) {
        expect(values.has(item.value), `duplicate ${item.value}`).toBe(false);
        values.add(item.value);
        expect(["customer", "provider", "both"]).toContain(item.audience);
        if (item.contextType) {
          expect(API_CONTEXT_TYPES.has(item.contextType)).toBe(true);
        }
      }
    }
  });

  it("booking and order prompts use selectable categories", () => {
    const customerBooking = getBookingSupportPrompt({ status: "confirmed", audience: "customer" });
    expect(isSelectableForAudience(customerBooking.category, "customer")).toBe(true);

    const providerBooking = getBookingSupportPrompt({ status: "no_show", audience: "provider" });
    expect(isSelectableForAudience(providerBooking.category, "provider")).toBe(true);

    const orderPrompt = getProductOrderSupportPrompt({ status: "shipped" });
    expect(isSelectableForAudience(orderPrompt.category, "customer")).toBe(true);
  });

  it("search respects audience and resolves group filter by id or label", () => {
    const hits = searchCategories("refund", "customer");
    expect(hits.some((h) => h.value === "payment_refund")).toBe(true);
    expect(resolveGroupFilter("bookings")?.id).toBe("bookings");
    expect(resolveGroupFilter("Bookings & appointments")?.id).toBe("bookings");
  });

  it("legacy payments is not selectable but has a label", () => {
    expect(isSelectableSupportTicketCategory("payments")).toBe(false);
    expect(labelForSupportTicketCategory("payments")).toBe("Payments (legacy)");
  });

  it("humanizes unknown values", () => {
    expect(humanizeCategoryValue("some_old_value")).toBe("Some old value");
  });

  it("parseUserSubmittedCategory defaults blank and rejects legacy", () => {
    expect(parseUserSubmittedCategory(undefined)).toEqual({ ok: true, category: "general_inquiry" });
    expect(parseUserSubmittedCategory("booking_issue")).toEqual({ ok: true, category: "booking_issue" });
    expect(parseUserSubmittedCategory("payments").ok).toBe(false);
  });

  it("provider audience excludes customer-only items", () => {
    const providerValues = new Set(listCategoriesForAudience("provider").map((i) => i.value));
    expect(providerValues.has("marked_no_show_incorrectly")).toBe(false);
    expect(providerValues.has("provider_payouts")).toBe(true);
  });
});

describe("isSafetySupportCategory", () => {
  it("matches safety_ prefix only", () => {
    expect(isSafetySupportCategory("safety_emergency")).toBe(true);
    expect(isSafetySupportCategory("payment_refund")).toBe(false);
  });
});
