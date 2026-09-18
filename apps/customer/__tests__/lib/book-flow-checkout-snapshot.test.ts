import {
  clearCheckoutHandoffCache,
  getCheckoutHandoffSnapshot,
  setCheckoutHandoffSnapshot,
} from "@/lib/book-flow-checkout-snapshot";

describe("book-flow-checkout-snapshot", () => {
  beforeEach(() => {
    clearCheckoutHandoffCache();
  });

  it("returns snapshot for matching user and hold", () => {
    setCheckoutHandoffSnapshot("user-1", {
      hold_id: "hold-1",
      provider_id: "prov-1",
      start_at: "2026-01-01T10:00:00Z",
      end_at: "2026-01-01T11:00:00Z",
      location_type: "at_salon",
      booking_services_snapshot: [],
    });
    expect(getCheckoutHandoffSnapshot("user-1", "hold-1")?.provider_id).toBe("prov-1");
    expect(getCheckoutHandoffSnapshot("user-2", "hold-1")).toBeNull();
  });
});
