import React from "react";
import { render } from "@testing-library/react-native";

const mockRequestPermission = jest.fn();
const mockGetPermission = jest.fn();

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [
    { granted: false, canAskAgain: true },
    mockRequestPermission,
    mockGetPermission,
  ],
}));

import { BarcodeScannerModal } from "@/features/products/BarcodeScannerModal";

describe("BarcodeScannerModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows Continue (not Allow camera) when permission is missing", () => {
    const screen = render(
      <BarcodeScannerModal visible onClose={jest.fn()} onScanned={jest.fn()} />,
    );

    expect(screen.getByText("Continue")).toBeTruthy();
    expect(screen.queryByText("Allow camera")).toBeNull();
  });
});
