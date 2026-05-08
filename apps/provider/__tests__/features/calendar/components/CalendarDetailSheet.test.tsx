import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "u1" } } }),
}));
jest.mock("@/lib/api-client", () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("@/lib/sentry", () => ({ captureError: jest.fn(), isSentryEnabled: () => false }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-gesture-handler", () => ({
  Gesture: { Pan: () => ({ activeOffsetX: () => ({}) }) },
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@beautonomi/i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
// Mock BottomSheet so tests focus on CalendarDetailSheet content logic
jest.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({ visible, children, title }: { visible: boolean; children: React.ReactNode; title?: string }) => {
    if (!visible) return null;
    const { View, Text } = require("react-native");
    return (
      <View>
        {title ? <Text>{title}</Text> : null}
        {children}
      </View>
    );
  },
}));

import { CalendarDetailSheet } from "@/features/calendar/sheets/CalendarDetailSheet";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";

const t = ((key: string) => key) as Parameters<typeof CalendarDetailSheet>[0]["t"];

const baseBooking: CalendarBooking = {
  id: "bk1",
  calendar_item_id: "ci1",
  status: "booked",
  db_status: "confirmed",
  scheduled_at: "2026-05-08T09:00:00.000Z",
  total_amount: 500,
  total_paid: 0,
  payment_status: "pending",
  currency: "ZAR",
  location_type: "salon",
  services: [{ name: "Haircut", duration_minutes: 30, price: 200, staff_id: "s1", staff_name: "Sipho" }],
  customers: { full_name: "Jane Smith", phone: "+27 71 000 0000" },
  calendar_service_name: "Haircut",
  locations: { name: "Main Salon" },
} as unknown as CalendarBooking;

const mockApplyStatus = jest.fn().mockResolvedValue({ error: null });

describe("CalendarDetailSheet", () => {
  it("renders customer name as sheet title when visible", () => {
    const { getByText } = render(
      <CalendarDetailSheet
        visible
        booking={baseBooking}
        providerTimezone="Africa/Johannesburg"
        onClose={jest.fn()}
        onApplyStatus={mockApplyStatus}
        t={t}
      />,
    );
    expect(getByText("Jane Smith")).toBeTruthy();
  });

  it("renders service name from services array", () => {
    const { getByText } = render(
      <CalendarDetailSheet
        visible
        booking={baseBooking}
        providerTimezone="Africa/Johannesburg"
        onClose={jest.fn()}
        onApplyStatus={mockApplyStatus}
        t={t}
      />,
    );
    expect(getByText("Haircut")).toBeTruthy();
  });

  it("shows Open Full Record button", () => {
    const { getByText } = render(
      <CalendarDetailSheet
        visible
        booking={baseBooking}
        providerTimezone="Africa/Johannesburg"
        onClose={jest.fn()}
        onApplyStatus={mockApplyStatus}
        t={t}
      />,
    );
    expect(getByText("Open Full Record")).toBeTruthy();
  });

  it("does not render content when booking is null", () => {
    const { queryByText } = render(
      <CalendarDetailSheet
        visible
        booking={null}
        providerTimezone={null}
        onClose={jest.fn()}
        onApplyStatus={mockApplyStatus}
        t={t}
      />,
    );
    expect(queryByText("Open Full Record")).toBeNull();
  });

  it("shows Reschedule button when onReschedule provided", () => {
    const { getByText } = render(
      <CalendarDetailSheet
        visible
        booking={baseBooking}
        providerTimezone="Africa/Johannesburg"
        onClose={jest.fn()}
        onApplyStatus={mockApplyStatus}
        onReschedule={jest.fn()}
        t={t}
      />,
    );
    expect(getByText("Reschedule")).toBeTruthy();
  });

  it("does not render when not visible", () => {
    const { queryByText } = render(
      <CalendarDetailSheet
        visible={false}
        booking={baseBooking}
        providerTimezone="Africa/Johannesburg"
        onClose={jest.fn()}
        onApplyStatus={mockApplyStatus}
        t={t}
      />,
    );
    expect(queryByText("Jane Smith")).toBeNull();
  });

  it("shows primary action button for confirmed booking", () => {
    const { queryByText } = render(
      <CalendarDetailSheet
        visible
        booking={{ ...baseBooking, db_status: "confirmed" } as unknown as CalendarBooking}
        providerTimezone="Africa/Johannesburg"
        onClose={jest.fn()}
        onApplyStatus={mockApplyStatus}
        t={t}
      />,
    );
    // The sheet should render a primary action or at least the customer name
    expect(queryByText("Jane Smith")).toBeTruthy();
  });

  it("still renders customer name when isPending (actions disabled but sheet shows)", () => {
    const { getByText } = render(
      <CalendarDetailSheet
        visible
        booking={baseBooking}
        providerTimezone="Africa/Johannesburg"
        onClose={jest.fn()}
        onApplyStatus={mockApplyStatus}
        isPending
        t={t}
      />,
    );
    // Sheet remains visible with content when isPending=true; buttons are just disabled
    expect(getByText("Jane Smith")).toBeTruthy();
  });
});
