import React from "react";
import { I18nManager } from "react-native";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ContextualHint } from "@/components/hints/ContextualHint";
import { hintStorageKey } from "@/lib/contextual-hints/storage";
import { trackHintAction, trackHintDismissed, trackHintShown } from "@/lib/analytics";

let mockFlagEnabled = true;

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    Ionicons: () => React.createElement(Text, { testID: "icon" }, " "),
  };
});

jest.mock("@beautonomi/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "common.hints.gotIt") return "Got it";
      if (key === "common.hints.dismissA11y") return "Dismiss tip";
      return key;
    },
  }),
}));

jest.mock("@/providers/ConfigBundleProvider", () => ({
  useFeatureFlag: () => mockFlagEnabled,
}));

jest.mock("@/lib/analytics", () => ({
  trackHintShown: jest.fn(),
  trackHintDismissed: jest.fn(),
  trackHintAction: jest.fn(),
}));

jest.mock("@/components/ui/DirectionalIcon", () => ({
  DirectionalIcon: () => null,
}));

describe("ContextualHint", () => {
  beforeEach(async () => {
    mockFlagEnabled = true;
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("renders a persistent hint without a dismiss control or analytics", () => {
    render(<ContextualHint id="test.persistent" message="Stay visible" mode="persistent" />);
    expect(screen.getByText("Stay visible")).toBeTruthy();
    expect(screen.queryByText("Got it")).toBeNull();
    expect(trackHintShown).not.toHaveBeenCalled();
  });

  it("keeps persistent hints when the kill switch is off", () => {
    mockFlagEnabled = false;
    render(<ContextualHint id="test.persistent" message="Money note" mode="persistent" />);
    expect(screen.getByText("Money note")).toBeTruthy();
  });

  it("hides once hints when the kill switch is off", async () => {
    mockFlagEnabled = false;
    render(<ContextualHint id="test.flagged" message="Tip" mode="once" />);
    await waitFor(() => expect(screen.queryByText("Tip")).toBeNull());
    expect(trackHintShown).not.toHaveBeenCalled();
  });

  it("hides a once hint after dismiss and on remount, and logs events", async () => {
    const id = "test.once";
    const { unmount } = render(<ContextualHint id={id} message="Show once" mode="once" />);
    await waitFor(() => expect(screen.getByText("Show once")).toBeTruthy());
    expect(trackHintShown).toHaveBeenCalledWith(id, "customer");

    fireEvent.press(screen.getByLabelText("Dismiss tip"));
    await waitFor(() => expect(screen.queryByText("Show once")).toBeNull());
    expect(await AsyncStorage.getItem(hintStorageKey(id))).toBe("1");
    expect(trackHintDismissed).toHaveBeenCalledWith(id, "customer");

    unmount();
    render(<ContextualHint id={id} message="Show once" mode="once" />);
    await waitFor(() => expect(screen.queryByText("Show once")).toBeNull());
  }, 20000);

  it("fires the action callback and logs hint_action", async () => {
    const onAction = jest.fn();
    render(
      <ContextualHint id="test.action" message="Tip" mode="once" actionLabel="Open" onAction={onAction} />,
    );
    await waitFor(() => expect(screen.getByText("Open")).toBeTruthy());
    fireEvent.press(screen.getByLabelText("Open"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(trackHintAction).toHaveBeenCalledWith("test.action", "customer");
  });

  it("renders in RTL", async () => {
    const original = I18nManager.isRTL;
    Object.defineProperty(I18nManager, "isRTL", { value: true, configurable: true });
    try {
      render(<ContextualHint id="test.rtl" message="نص" mode="once" />);
      await waitFor(() => expect(screen.getByText("نص")).toBeTruthy());
      expect(screen.getByLabelText("Dismiss tip")).toBeTruthy();
    } finally {
      Object.defineProperty(I18nManager, "isRTL", { value: original, configurable: true });
    }
  });
});
