import { describe, expect, it } from "vitest";
import { adminSpaTo } from "./adminSpaPath";
import {
  adminSupportContextActionLabel,
  adminSupportContextHref,
  adminSupportTicketsSearchHref,
} from "./adminSupportContextHref";

describe("adminSupportContextHref", () => {
  it("maps booking, order, and gift card ids to admin pages", () => {
    expect(adminSupportContextHref("booking", "b1")).toBe("/admin/bookings/b1");
    expect(adminSupportContextHref("product_order", "o1")).toBe("/admin/ecommerce/orders/o1");
    expect(adminSupportContextHref("gift_card", "g1")).toBe("/admin/gift-cards/g1");
  });

  it("returns null when type or id is missing", () => {
    expect(adminSupportContextHref("booking", "")).toBeNull();
    expect(adminSupportContextHref("payment", "p1")).toBeNull();
  });

  it("labels the open action", () => {
    expect(adminSupportContextActionLabel("booking")).toBe("Open booking");
    expect(adminSupportContextActionLabel("product_order")).toBe("Open product order");
  });

  it("builds a ticket search href", () => {
    expect(adminSupportTicketsSearchHref("BTN-1042")).toBe("/admin/support-tickets?q=BTN-1042");
    expect(adminSupportTicketsSearchHref("")).toBe("/admin/support-tickets");
  });

  it("composes with adminSpaTo so Related tickets keep the search query", () => {
    expect(adminSpaTo(adminSupportTicketsSearchHref("BTN-1042"))).toBe("/support-tickets?q=BTN-1042");
    expect(adminSpaTo(adminSupportTicketsSearchHref("GIFT-9X"))).toBe("/support-tickets?q=GIFT-9X");
  });
});
