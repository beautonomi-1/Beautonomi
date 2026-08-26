import { CUSTOMER_EULA_VERSION, storeCustomerEulaAcceptance, hasAcceptedCurrentCustomerEula } from "@/lib/legal-acceptance";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

describe("legal-acceptance (customer)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exports current customer EULA version", () => {
    expect(CUSTOMER_EULA_VERSION).toBe("2026-08-26");
  });

  it("hasAcceptedCurrentCustomerEula is true when stored version matches", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ version: CUSTOMER_EULA_VERSION, acceptedAt: "2026-08-26T00:00:00.000Z" }),
    );
    await expect(hasAcceptedCurrentCustomerEula()).resolves.toBe(true);
  });
});
