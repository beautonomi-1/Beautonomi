import { describe, it, expect, vi } from "vitest";
import { renderWithI18n as render, screen } from "@/test-utils/render-with-i18n";
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

vi.mock("../account-settings-redirect-client", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("../components/account-hub-grid", () => ({
  __esModule: true,
  default: () => <div data-testid="account-hub-grid">hub</div>,
}));

vi.mock("@/lib/i18n/server", () => ({
  getServerT: async () => (key: string) => {
    const labels: Record<string, string> = {
      "web.accountSettings.account": "Account",
      "web.accountSettings.home.subtitle": "Manage your profile and preferences",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("@/lib/locale/resolve-request-language", () => ({
  resolveRequestLanguage: async () => ({ language: "en" }),
}));

import AccountSettingsPage from "../page";

describe("account-settings page", () => {
  it("renders hub shell with account title and hub grid", async () => {
    render(await AccountSettingsPage());
    expect(screen.getByRole("heading", { name: /account/i })).toBeInTheDocument();
    expect(screen.getByTestId("account-hub-grid")).toBeInTheDocument();
  });
});
