import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithI18n as render, screen, fireEvent } from "@/test-utils/render-with-i18n";
import { GlobalPreferencesDialog } from "../GlobalPreferencesDialog";

vi.mock("@/hooks/useLanguageOptions", () => ({
  useLanguageOptions: () => ({
    waveA: [{ code: "en", name: "English" }],
    waveB: [],
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}));

vi.mock("@/hooks/useGlobalPreferences", () => ({
  useGlobalPreferences: () => ({
    currencies: [{ code: "ZAR", name: "Rand", label: "ZAR (R)", isDefault: true }],
    currenciesLoading: false,
    currenciesError: false,
    reloadCurrencies: vi.fn(),
    savingLanguage: null,
    savingCurrency: null,
    saveLanguage: vi.fn(),
    saveCurrency: vi.fn(),
    tenantCurrency: "ZAR",
    chargeCurrency: "ZAR",
    displayCurrency: "ZAR",
    currentLanguage: "en",
  }),
}));

vi.mock("@/hooks/useMediaQueryMatch", () => ({
  useMediaQueryMatch: () => true,
  TW_MD_MIN_QUERY: "(min-width: 768px)",
}));

vi.mock("@/components/cookie-consent/CookieSettingsFooterLink", () => ({
  CookieSettingsFooterLink: () => <span>Cookie settings</span>,
}));

describe("GlobalPreferencesDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders currency scope footnote with charge and display codes", () => {
    render(<GlobalPreferencesDialog open onOpenChange={() => {}} surface="header" defaultTab="currency" />);
    expect(screen.getByText(/Prices are shown in ZAR/i)).toBeInTheDocument();
    expect(screen.getByText(/You pay in ZAR at checkout/i)).toBeInTheDocument();
  });

  it("shows language search on language tab", () => {
    render(<GlobalPreferencesDialog open onOpenChange={() => {}} surface="header" defaultTab="language" />);
    expect(screen.getByPlaceholderText(/Search languages/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /English/i }));
  });

  it("does not offer a region tab — market is inferred from IP / host", () => {
    render(<GlobalPreferencesDialog open onOpenChange={() => {}} surface="header" defaultTab="language" />);
    expect(screen.queryByRole("tab", { name: /region/i })).not.toBeInTheDocument();
  });
});
