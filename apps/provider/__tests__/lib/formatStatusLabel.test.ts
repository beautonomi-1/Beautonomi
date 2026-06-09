import { formatStatusLabel } from "@/lib/format";

describe("formatStatusLabel", () => {
  it("maps known booking statuses", () => {
    expect(formatStatusLabel("completed")).toBe("Completed");
    expect(formatStatusLabel("no_show")).toBe("No-show");
  });

  it("title-cases unknown snake_case values", () => {
    expect(formatStatusLabel("payout_eligibility_status")).toBe("Payout Eligibility Status");
  });

  it("returns em dash for empty input", () => {
    expect(formatStatusLabel("")).toBe("—");
    expect(formatStatusLabel(null)).toBe("—");
  });
});
