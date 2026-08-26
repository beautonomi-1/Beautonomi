import { webPartnerEulaUrl } from "@/lib/legal-web";

jest.mock("@/config/public-env", () => ({
  APP_URL: "https://www.beautonomi.com",
}));

describe("legal-web (provider)", () => {
  it("webPartnerEulaUrl returns partner EULA path", () => {
    expect(webPartnerEulaUrl()).toBe("https://www.beautonomi.com/provider/eula");
  });
});
