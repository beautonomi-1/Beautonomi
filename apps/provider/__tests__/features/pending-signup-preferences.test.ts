import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  applyPendingSignupPreferences,
  persistProviderSignupSource,
  PENDING_SIGNUP_SOURCE_KEY,
  PROVIDER_MOBILE_SIGNUP_SOURCE,
} from "@/features/auth/pending-signup-preferences";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    patch: jest.fn().mockResolvedValue({ error: null }),
  },
}));

jest.mock("@/lib/i18n", () => ({
  changeLanguage: jest.fn().mockResolvedValue(undefined),
}));

describe("pending-signup-preferences", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("persists provider_mobile signup source before auth", async () => {
    await persistProviderSignupSource();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      PENDING_SIGNUP_SOURCE_KEY,
      PROVIDER_MOBILE_SIGNUP_SOURCE,
    );
  });

  it("patches profile with signup_source then clears pending key", async () => {
    const { api } = jest.requireMock<{ api: { patch: jest.Mock } }>("@/lib/api-client");
    (AsyncStorage.getItem as jest.Mock)
      .mockResolvedValueOnce(PROVIDER_MOBILE_SIGNUP_SOURCE)
      .mockResolvedValueOnce(null);

    await applyPendingSignupPreferences();

    expect(api.patch).toHaveBeenCalledWith("/api/me/profile", {
      signup_source: PROVIDER_MOBILE_SIGNUP_SOURCE,
    });
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(PENDING_SIGNUP_SOURCE_KEY);
  });
});
