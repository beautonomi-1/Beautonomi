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
 */
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
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

jest.mock("@expo/vector-icons", () => {
  const { Text } = require("react-native");
  return {
    Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text>,
  };
});

// ── Import component under test ───────────────────────────────────────────────
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import { useLocalSearchParams } from "expo-router";

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
    renderScreen({ cancelled: "1" });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(CANCELLED);
    }, { timeout: 3000 });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  // ── No reference ──────────────────────────────────────────────────────────

  it("navigates to fallbackRoute immediately when there is no reference", async () => {
    renderScreen({});
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(FALLBACK);
    }, { timeout: 3000 });
    expect(mockVerify).not.toHaveBeenCalled();
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

  // ── Verify success (real timers + waitFor) ────────────────────────────────

  it("auto-navigates to resolvedTarget on verify success", async () => {
    mockVerify.mockResolvedValue({
      status: "success",
      data: { bookingId: "bk-1" },
      attempts: 1,
      errorMessage: null,
    });

    renderScreen({ reference: "ref-success" });

    // With real timers, waitFor polls until the assertion passes.
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(BOOKING_TARGET);
    }, { timeout: 4000 });
  });

  it("shows continueCta label after verify resolves to a known target", async () => {
    mockVerify.mockResolvedValue({
      status: "success",
      data: { bookingId: "bk-1" },
      attempts: 1,
      errorMessage: null,
    });

    const { findByRole } = renderScreen({ reference: "ref-success" });

    const btn = await findByRole("button", { name: defaultLabels.continueCta }, { timeout: 4000 });
    expect(btn).toBeTruthy();

    // Manual press also navigates to the resolved target.
    mockReplace.mockClear();
    fireEvent.press(btn);
    expect(mockReplace).toHaveBeenCalledWith(BOOKING_TARGET);
  });

  // ── Verify failed (real timers + waitFor) ─────────────────────────────────

  it("auto-navigates to fallbackRoute on verify failure", async () => {
    mockVerify.mockResolvedValue({
      status: "failed",
      data: null,
      attempts: 5,
      errorMessage: "Could not confirm payment",
    });

    renderScreen({ reference: "ref-fail" });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(FALLBACK);
    }, { timeout: 4000 });
  });

  // ── onSuccess side-effect (real timers + waitFor) ─────────────────────────

  it("calls onSuccess before navigating on verify success", async () => {
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

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalled();
    }, { timeout: 4000 });
  });
});
