import { describe, expect, it, vi } from "vitest";
import { publicLearnUrl } from "./learning";

vi.mock("@/config/publicEnv", () => ({
  publicSiteOrigin: () => "https://beautonomi.com",
}));

describe("publicLearnUrl", () => {
  it("builds customer/provider-facing learn URLs on the public site, not admin", () => {
    expect(publicLearnUrl("provider-commissions-payroll")).toBe(
      "https://beautonomi.com/learn/article/provider-commissions-payroll",
    );
    expect(publicLearnUrl("provider-web-finance-payouts")).toBe(
      "https://beautonomi.com/learn/article/provider-web-finance-payouts",
    );
  });
});
