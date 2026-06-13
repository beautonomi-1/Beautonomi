import { computeUnifiedUnread } from "@/lib/unified-unread-badge";

describe("unified unread badge", () => {
  it("sums notifications and chat unread", () => {
    expect(computeUnifiedUnread(3, 2)).toBe(5);
  });

  it("never returns negative totals", () => {
    expect(computeUnifiedUnread(0, 0)).toBe(0);
  });
});
