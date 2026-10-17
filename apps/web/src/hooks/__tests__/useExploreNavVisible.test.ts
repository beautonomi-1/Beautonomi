import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useExploreNavVisible } from "@/hooks/useExploreNavVisible";

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/providers/ConfigBundleProvider", () => ({
  useFeatureFlag: vi.fn(),
}));

vi.mock("@/hooks/useViewerSafetySettings", () => ({
  useViewerSafetySettings: vi.fn(),
}));

import { useAuth } from "@/providers/AuthProvider";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useViewerSafetySettings } from "@/hooks/useViewerSafetySettings";

describe("useExploreNavVisible", () => {
  beforeEach(() => {
    vi.mocked(useFeatureFlag).mockReturnValue(true);
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", role: "customer" },
      isLoading: false,
    } as ReturnType<typeof useAuth>);
  });

  it("hides when hide_social_feed is true for signed-in user", () => {
    vi.mocked(useViewerSafetySettings).mockReturnValue({
      hide_social_feed: true,
      age_band: "18_plus",
      loading: false,
    });

    const { result } = renderHook(() => useExploreNavVisible());
    expect(result.current).toBe(false);
  });

  it("shows when hide_social_feed is false for adult", () => {
    vi.mocked(useViewerSafetySettings).mockReturnValue({
      hide_social_feed: false,
      age_band: "18_plus",
      loading: false,
    });

    const { result } = renderHook(() => useExploreNavVisible());
    expect(result.current).toBe(true);
  });

  it("fail-opens while safety settings are loading", () => {
    vi.mocked(useViewerSafetySettings).mockReturnValue({
      hide_social_feed: true,
      age_band: "unknown",
      loading: true,
    });

    const { result } = renderHook(() => useExploreNavVisible());
    expect(result.current).toBe(true);
  });
});
