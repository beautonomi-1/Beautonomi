/**
 * PaystackReturnScreen — render + interaction tests.
 *
 * Covers:
 *  - Always-visible action button while in `verifying` state.
 *  - Button navigates to fallbackRoute immediately on press (no auto-nav yet).
 *  - Button does not double-navigate once navigatedRef is set.
 *  - "Taking longer" hint appears after the slow timer fires.
 *  - Cancelled param → navigates to cancelledRoute automatically.
 *  - Success verify result → navigates to resolvedTarget.
 *  - Failed verify result → navigates to fallbackRoute.
 *  - onSuccess callback fires before navigation.
 *
 * Auto-redirect cases use fake timers so CI load cannot flake on the
 * 1.5–2s wall-clock delays in PaystackReturnScreen.
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, canGoBack: mockCanGoBack }),
  useLocalSearchParams: jest.fn(() => ({})),
  Stack: {
    Screen: () => null,
  },
}));

const mockVerify = jest.fn();
jest.mock("@/lib/payments/verifyPaystackWithRetry", () => ({
  verifyPaystackWithRetry: (...args: unknown[]) => mockVerify(...args),
}));

jest.mock("@/lib/paystack-verify-guard", () => ({
  markReferenceProcessing: jest.fn(),
  isReferenceProcessing: jest.fn(() => false),
  clearReferenceProcessing: jest.fn(),
}));

jest.mock("@/lib/haptics", () => ({
  haptic: { success: jest.fn() },
}));

jest.mock("@expo/vector-icons", () => {
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text>,
  };
});

// ── Import component under test ───────────────────────────────────────────────
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import { useLocalSearchParams } from "expo-router";
import { isReferenceProcessing } from "@/lib/paystack-verify-guard";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const defaultLabels = {
  verifying: "Confirming your payment…",
  returning: "Returning…",
  fallbackCta: "Go to Bookings",
  continueCta: "View booking",
};

const FALLBACK = { pathname: "/(app)/(tabs)/bookings" } as const;
const CANCELLED = { pathname: "/(app)/(tabs)/bookings" } as const;
const BOOKING_TARGET = { pathname: "/(app)/booking-detail", params: { id: "bk-1" } } as const;

function resolveBooking(data: unknown) {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.bookingId === "string") {
      return { pathname: "/(app)/booking-detail", params: { id: d.bookingId } };
    }
  }
  return null;
}

function renderScreen(paramOverrides: Record<string, string> = {}) {
  (useLocalSearchParams as jest.Mock).mockReturnValue(paramOverrides);
  return render(
    <PaystackReturnScreen
      resolveTarget={resolveBooking}
      cancelledRoute={CANCELLED}
      fallbackRoute={FALLBACK}
      labels={defaultLabels}
    />,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("PaystackReturnScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(false);
    (isReferenceProcessing as jest.Mock).mockReturnValue(false);
    // Default: verify never resolves — keeps the component stuck in `verifying`.
    mockVerify.mockReturnValue(new Promise(() => {}));
  });

  // ── Always-visible button (no timers needed) ──────────────────────────────

  it("renders the fallback CTA button immediately while verifying", () => {
    const { getByRole } = renderScreen({ reference: "ref-abc123" });
    expect(getByRole("button", { name: defaultLabels.fallbackCta })).toBeTruthy();
  });

  it("button navigates to fallbackRoute when pressed during verification", () => {
    const { getByRole } = renderScreen({ reference: "ref-abc123" });
    fireEvent.press(getByRole("button", { name: defaultLabels.fallbackCta }));
    expect(mockReplace).toHaveBeenCalledWith(FALLBACK);
  });

  it("button is still present even before any reference is given", () => {
    const { getByRole } = renderScreen({});
    expect(getByRole("button", { name: defaultLabels.fallbackCta })).toBeTruthy();
  });

  // ── Cancelled payment ────────────────────────────────────────────────────

  it("auto-navigates to cancelledRoute when cancelled=1 param is set", async () => {
    jest.useFakeTimers();
    try {
      renderScreen({ cancelled: "1" });
      act(() => {
        jest.advanceTimersByTime(800);
      });
      expect(mockReplace).toHaveBeenCalledWith(CANCELLED);
      expect(mockVerify).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // ── No reference ──────────────────────────────────────────────────────────

  it("navigates to fallbackRoute immediately when there is no reference", async () => {
    jest.useFakeTimers();
    try {
      renderScreen({});
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(mockReplace).toHaveBeenCalledWith(FALLBACK);
      expect(mockVerify).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  // ── Slow hint (fake timers) ───────────────────────────────────────────────

  it("shows 'taking longer' hint after slow timer fires while verifying", async () => {
    jest.useFakeTimers();
    try {
      const { queryByText, getByText } = renderScreen({ reference: "ref-abc123" });

      // Not shown before the slow timer.
      expect(queryByText(/taking longer/i)).toBeNull();

      // Advance past SLOW_HINT_MS (7000ms).
      act(() => {
        jest.advanceTimersByTime(7_100);
      });

      expect(getByText(/taking longer than expected/i)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  // ── Double-navigation guard ───────────────────────────────────────────────

  it("does not navigate twice if button is pressed twice in quick succession", () => {
    const { getByRole } = renderScreen({ reference: "ref-abc123" });
    const btn = getByRole("button", { name: defaultLabels.fallbackCta });

    fireEvent.press(btn);
    fireEvent.press(btn); // second press must be a no-op

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(FALLBACK);
  });

  // ── Verify success / failure (fake timers — avoid CI wall-clock flakes) ───

  /** Flush the verify promise so the redirect setTimeout is scheduled. */
  async function settleVerify() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("auto-navigates to resolvedTarget on verify success", async () => {
    jest.useFakeTimers();
    try {
      mockVerify.mockResolvedValue({
        status: "success",
        data: { bookingId: "bk-1" },
        attempts: 1,
        errorMessage: null,
      });

      renderScreen({ reference: "ref-success" });
      await settleVerify();

      act(() => {
        jest.advanceTimersByTime(1_500);
      });

      expect(mockReplace).toHaveBeenCalledWith(BOOKING_TARGET);
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows continueCta label after verify resolves to a known target", async () => {
    jest.useFakeTimers();
    try {
      mockVerify.mockResolvedValue({
        status: "success",
        data: { bookingId: "bk-1" },
        attempts: 1,
        errorMessage: null,
      });

      const { getByRole } = renderScreen({ reference: "ref-success" });
      await settleVerify();

      const btn = getByRole("button", { name: defaultLabels.continueCta });
      expect(btn).toBeTruthy();

      // Manual press also navigates to the resolved target.
      mockReplace.mockClear();
      fireEvent.press(btn);
      expect(mockReplace).toHaveBeenCalledWith(BOOKING_TARGET);
    } finally {
      jest.useRealTimers();
    }
  });

  it("auto-navigates to fallbackRoute on verify failure", async () => {
    jest.useFakeTimers();
    try {
      mockVerify.mockResolvedValue({
        status: "failed",
        data: null,
        attempts: 5,
        errorMessage: "Could not confirm payment",
      });

      renderScreen({ reference: "ref-fail" });
      await settleVerify();

      act(() => {
        jest.advanceTimersByTime(2_000);
      });

      expect(mockReplace).toHaveBeenCalledWith(FALLBACK);
    } finally {
      jest.useRealTimers();
    }
  });

  it("calls onSuccess before navigating on verify success", async () => {
    jest.useFakeTimers();
    try {
      const onSuccess = jest.fn();
      mockVerify.mockResolvedValue({
        status: "success",
        data: { bookingId: "bk-1" },
        attempts: 1,
        errorMessage: null,
      });

      (useLocalSearchParams as jest.Mock).mockReturnValue({ reference: "ref-xyz" });
      render(
        <PaystackReturnScreen
          resolveTarget={resolveBooking}
          cancelledRoute={CANCELLED}
          fallbackRoute={FALLBACK}
          labels={defaultLabels}
          onSuccess={onSuccess}
        />,
      );

      await settleVerify();
      expect(onSuccess).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(1_500);
      });
      expect(mockReplace).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  // ── Cooperative branch (parent owns verify) ───────────────────────────────

  it("dismisses cooperatively with router.back when parent owns verification", async () => {
    jest.useFakeTimers();
    try {
      (isReferenceProcessing as jest.Mock).mockReturnValue(true);
      mockCanGoBack.mockReturnValue(true);

      renderScreen({ reference: "ref-cooperative" });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockVerify).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // ── Watchdog (verify hang) ────────────────────────────────────────────────

  it("transitions to pending and auto-navigates after verify watchdog expires", async () => {
    jest.useFakeTimers();
    try {
      const { getByText } = renderScreen({ reference: "ref-hang" });

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(getByText(/your payment is being confirmed/i)).toBeTruthy();

      act(() => {
        jest.advanceTimersByTime(1_600);
      });

      expect(mockReplace).toHaveBeenCalledWith(FALLBACK);
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows Try again on failed verify and re-runs verification", async () => {
    jest.useFakeTimers();
    try {
      mockVerify
        .mockResolvedValueOnce({
          status: "failed",
          data: null,
          attempts: 5,
          errorMessage: "Could not confirm payment",
        })
        .mockReturnValueOnce(new Promise(() => {}));

      const { getByRole } = renderScreen({ reference: "ref-retry" });
      await settleVerify();

      fireEvent.press(getByRole("button", { name: "Try again" }));

      await settleVerify();
      expect(mockVerify).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
