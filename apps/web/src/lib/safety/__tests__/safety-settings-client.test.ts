import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/fetcher", () => ({
  fetcher: { get: vi.fn(), patch: vi.fn() },
  deleteFetcherGetCacheEntriesMatching: vi.fn(),
}));

import { deleteFetcherGetCacheEntriesMatching, fetcher } from "@/lib/http/fetcher";
import {
  VIEWER_SAFETY_SETTINGS_EVENT,
  canToggleSafetySetting,
  clearRememberedViewerSafety,
  countActiveSafetyRestrictions,
  parseSafetySettingsPayload,
  patchSafetySetting,
  readRememberedViewerSafety,
  rememberViewerSafety,
} from "../safety-settings-client";

describe("safety-settings-client", () => {
  it("parses the API payload with safe defaults", () => {
    const snap = parseSafetySettingsPayload({
      hide_social_feed: true,
      locked: { hide_social_feed: true },
      age_band: "13_17",
      age_source: "declared_dob",
    });
    expect(snap.settings.hide_social_feed).toBe(true);
    expect(snap.settings.restricted_mode).toBe(false);
    expect(snap.locked.hide_social_feed).toBe(true);
    expect(snap.age_band).toBe("13_17");
    expect(snap.age_source).toBe("declared_dob");
    expect(parseSafetySettingsPayload(null).age_band).toBe("unknown");
  });

  it("blocks toggling locked keys only", () => {
    const snap = parseSafetySettingsPayload({ locked: { hide_social_feed: true } });
    expect(canToggleSafetySetting(snap, "hide_social_feed")).toBe(false);
    expect(canToggleSafetySetting(snap, "restricted_mode")).toBe(true);
  });

  it("counts restrictions like mobile (excludes require_device_auth)", () => {
    const snap = parseSafetySettingsPayload({ hide_social_feed: true, require_device_auth: true });
    expect(countActiveSafetyRestrictions(snap.settings)).toBe(1);
  });

  it("remembers settings for the signed-in user only", () => {
    clearRememberedViewerSafety();
    rememberViewerSafety("user-a", { hide_social_feed: true, age_band: "18_plus" });
    expect(readRememberedViewerSafety("user-a")).toMatchObject({ hide_social_feed: true, age_band: "18_plus" });
    expect(readRememberedViewerSafety("user-b")).toBeNull();
    clearRememberedViewerSafety();
    expect(readRememberedViewerSafety("user-a")).toBeNull();
  });

  it("broadcasts PATCH results and clears the cached GET", async () => {
    vi.mocked(fetcher.patch).mockResolvedValue({ data: { hide_social_feed: true, age_band: "18_plus" } });
    const listener = vi.fn();
    window.addEventListener(VIEWER_SAFETY_SETTINGS_EVENT, listener);
    const snap = await patchSafetySetting("hide_social_feed", true);
    window.removeEventListener(VIEWER_SAFETY_SETTINGS_EVENT, listener);

    expect(fetcher.patch).toHaveBeenCalledWith("/api/me/safety-settings", { hide_social_feed: true });
    expect(deleteFetcherGetCacheEntriesMatching).toHaveBeenCalledWith("/api/me/safety-settings");
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(snap);
    expect(snap.settings.hide_social_feed).toBe(true);
  });
});
