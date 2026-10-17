import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

const mockApiPost = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("@/lib/api-client", () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
}));

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@beautonomi/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("@/lib/legal-acceptance", () => ({
  hasAcceptedCurrentPartnerEula: jest.fn(() => Promise.resolve(true)),
  storePartnerEulaAcceptance: jest.fn(() => Promise.resolve()),
  PARTNER_EULA_VERSION: "v1",
}));

jest.mock("@/lib/legal-web", () => ({
  webPartnerEulaUrl: () => "https://example.com/eula",
  webPrivacyPolicyUrl: () => "https://example.com/privacy",
}));

jest.mock("@/components/ui/BeautonomiLogo", () => ({ BeautonomiLogo: () => null }));

import { LegalAcceptanceGate } from "@/components/legal/LegalAcceptanceGate";

describe("Provider LegalAcceptanceGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiPost.mockResolvedValue({ data: {} });
  });

  it("syncs legal acceptance once per user id despite new session object", async () => {
    mockUseAuth.mockReturnValue({ session: { user: { id: "p1" }, access_token: "a" } });
    const screen = render(
      <LegalAcceptanceGate>
        <Text>Provider shell</Text>
      </LegalAcceptanceGate>,
    );
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Provider shell")).toBeTruthy();

    mockUseAuth.mockReturnValue({ session: { user: { id: "p1" }, access_token: "b" } });
    screen.rerender(
      <LegalAcceptanceGate>
        <Text>Provider shell</Text>
      </LegalAcceptanceGate>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });
});
