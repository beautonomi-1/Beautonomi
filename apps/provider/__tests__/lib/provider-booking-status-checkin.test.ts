import { getAllowedTransitionTargets } from "@/lib/provider-booking-status-transitions";

describe("getAllowedTransitionTargets salon check-in", () => {
  it("includes checked_in from confirmed and pending", () => {
    expect(getAllowedTransitionTargets("confirmed")).toContain("checked_in");
    expect(getAllowedTransitionTargets("pending")).toContain("checked_in");
  });
});
