import { webCustomerEulaUrl } from "@/lib/legal-web";

jest.mock("@/config/public-env", () => ({
  APP_URL: "https://www.beautonomi.com",
}));

describe("legal-web (customer)", () => {
  it("webCustomerEulaUrl returns customer EULA path", () => {
    expect(webCustomerEulaUrl()).toBe("https://www.beautonomi.com/customer/eula");
  });
});
