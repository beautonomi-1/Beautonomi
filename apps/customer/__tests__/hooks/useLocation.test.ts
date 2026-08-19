const mockGetForegroundPermissionsAsync = jest.fn();
const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();
const mockEnsureForegroundLocationPermission = jest.fn();

jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) => mockGetForegroundPermissionsAsync(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestForegroundPermissionsAsync(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPositionAsync(...args),
  Accuracy: { Balanced: 3 },
}));

jest.mock("@/lib/native-permissions", () => ({
  ensureForegroundLocationPermission: (...args: unknown[]) =>
    mockEnsureForegroundLocationPermission(...args),
  PERMISSION_COPY: {
    locationNearby: {
      title: "Location access",
      message: "Location access is used to show nearby results and travel times.",
    },
  },
}));

jest.mock("@/providers/NativePermissionsOnboardingProvider", () => ({
  useNativePermissionsOnboardingGate: () => ({ gate: { phase: "complete", fromRestore: true } }),
}));

import { renderHook, waitFor } from "@testing-library/react-native";
import { useLocation } from "@/hooks/useLocation";

describe("useLocation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureForegroundLocationPermission.mockResolvedValue(true);
    mockGetCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: -33.9, longitude: 18.4 },
    });
  });

  it("does not request permission when enabled is false", async () => {
    const { result } = renderHook(() => useLocation({ enabled: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockEnsureForegroundLocationPermission).not.toHaveBeenCalled();
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
    expect(result.current.coords).toBeNull();
  });

  it("requests permission when enabled is true", async () => {
    const { result } = renderHook(() => useLocation({ enabled: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockEnsureForegroundLocationPermission).toHaveBeenCalled();
    expect(mockGetCurrentPositionAsync).toHaveBeenCalled();
    expect(result.current.coords).toEqual({ latitude: -33.9, longitude: 18.4 });
  });
});
