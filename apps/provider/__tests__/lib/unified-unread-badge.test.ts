import { computeUnifiedUnread } from "@/lib/unified-unread-badge";

describe("unified unread badge", () => {
  it("sums notifications and chat unread", () => {
    expect(computeUnifiedUnread(4, 1)).toBe(5);
  });

  it("floors fractional inputs", () => {
    expect(computeUnifiedUnread(2.9, 1.1)).toBe(3);
  });
});
