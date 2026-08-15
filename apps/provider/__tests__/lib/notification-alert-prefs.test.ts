const mockApiGet = jest.fn();

jest.mock("@/lib/api-client", () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

import {
  getAlertSoundPrefs,
  refreshAlertSoundPrefs,
} from "@/lib/notification-alert-prefs";
import { setProviderApiReady } from "@/lib/provider-api-readiness";

const MUTED_RESPONSE = {
  data: {
    booking_alert_sound: false,
    order_alert_sound: false,
    message_alert_sound: false,
  },
};

describe("alert sound preferences", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setProviderApiReady(false);
  });

  afterAll(() => {
    setProviderApiReady(false);
  });

  it("does not call the role-gated endpoint before provider APIs are ready", async () => {
    mockApiGet.mockResolvedValue(MUTED_RESPONSE);

    const prefs = await refreshAlertSoundPrefs();

    expect(mockApiGet).not.toHaveBeenCalled();
    // Fail open: an onboarding provider hears alerts rather than being muted by
    // preferences that could not be loaded.
    expect(prefs.booking_alert_sound).toBe(true);
  });

  it("loads the real preferences as soon as provider APIs become ready", async () => {
    mockApiGet.mockResolvedValue(MUTED_RESPONSE);

    setProviderApiReady(true);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockApiGet).toHaveBeenCalledWith("/api/provider/notification-preferences");
    expect(getAlertSoundPrefs().booking_alert_sound).toBe(false);
  });

  it("clears cached preferences on sign-out so the next account starts clean", async () => {
    mockApiGet.mockResolvedValue(MUTED_RESPONSE);

    setProviderApiReady(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getAlertSoundPrefs().message_alert_sound).toBe(false);

    setProviderApiReady(false);

    expect(getAlertSoundPrefs()).toEqual({
      booking_alert_sound: true,
      order_alert_sound: true,
      message_alert_sound: true,
    });
  });
});
