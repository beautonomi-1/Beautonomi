import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), prefetch: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/global/email-verification-banner", () => ({
  __esModule: true,
  default: () => <div data-testid="email-banner" />,
}));

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const Lazy = () => <div data-testid="upcoming-preview" />;
    Lazy.displayName = "UpcomingBookingPreviewLazy";
    return Lazy;
  },
}));

vi.mock("../components/account-hub-grid", () => ({
  __esModule: true,
  default: () => <div data-testid="account-hub-grid">hub</div>,
}));

import AccountSettingsPage from "../page";

describe("account-settings page", () => {
  it("renders hub shell with account title and hub grid", () => {
    render(<AccountSettingsPage />);
    expect(screen.getByRole("heading", { name: /account/i })).toBeInTheDocument();
    expect(screen.getByTestId("account-hub-grid")).toBeInTheDocument();
  });
});
