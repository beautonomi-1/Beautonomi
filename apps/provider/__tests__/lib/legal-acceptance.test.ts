import { PARTNER_EULA_VERSION, storePartnerEulaAcceptance, hasAcceptedCurrentPartnerEula } from "@/lib/legal-acceptance";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

describe("legal-acceptance (provider)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exports current partner EULA version", () => {
    expect(PARTNER_EULA_VERSION).toBe("2026-08-26");
  });

  it("hasAcceptedCurrentPartnerEula is true when stored version matches", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ version: PARTNER_EULA_VERSION, acceptedAt: "2026-08-26T00:00:00.000Z" }),
    );
    await expect(hasAcceptedCurrentPartnerEula()).resolves.toBe(true);
  });

  it("storePartnerEulaAcceptance persists version", async () => {
    const record = await storePartnerEulaAcceptance();
    expect(record.version).toBe(PARTNER_EULA_VERSION);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });
});
