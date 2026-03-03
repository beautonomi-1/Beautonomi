import React from "react";
import { render, screen } from "@testing-library/react-native";
import { OfflineBar } from "@/components/OfflineBar";

// Mock NetInfo
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn((callback) => {
    // Simulate offline state
    callback({ isConnected: false, isInternetReachable: false });
    return jest.fn(); // unsubscribe
  }),
}));

describe("OfflineBar", () => {
  it("shows offline message when disconnected", () => {
    render(<OfflineBar />);
    expect(screen.getByText("No internet connection")).toBeTruthy();
  });
});
