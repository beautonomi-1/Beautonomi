import React, { useRef } from "react";
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
  hasAcceptedCurrentCustomerEula: jest.fn(() => Promise.resolve(true)),
  storeCustomerEulaAcceptance: jest.fn(() => Promise.resolve()),
  CUSTOMER_EULA_VERSION: "v1",
}));

jest.mock("@/lib/legal-web", () => ({
  webCustomerEulaUrl: () => "https://example.com/eula",
  webPrivacyPolicyUrl: () => "https://example.com/privacy",
}));

jest.mock("@/components/ui/BeautonomiLogo", () => ({ BeautonomiLogo: () => null }));

import { LegalAcceptanceGate } from "@/components/legal/LegalAcceptanceGate";
import { hasAcceptedCurrentCustomerEula } from "@/lib/legal-acceptance";

let mountCount = 0;
function MountCounter() {
  const seen = useRef(false);
  if (!seen.current) {
    seen.current = true;
    mountCount += 1;
  }
  return <Text testID="mount-count">{mountCount}</Text>;
}

describe("LegalAcceptanceGate", () => {
  beforeEach(() => {
    mountCount = 0;
    jest.clearAllMocks();
    (hasAcceptedCurrentCustomerEula as jest.Mock).mockResolvedValue(true);
    mockUseAuth.mockReturnValue({ session: { user: { id: "u1" } } });
    mockApiPost.mockResolvedValue({ data: {} });
  });

  it("does not remount children when enabled toggles", async () => {
    const screen = render(
      <LegalAcceptanceGate enabled>
        <MountCounter />
      </LegalAcceptanceGate>,
    );
    await waitFor(() => expect(screen.getByTestId("mount-count")).toBeTruthy());
    screen.rerender(
      <LegalAcceptanceGate enabled={false}>
        <MountCounter />
      </LegalAcceptanceGate>,
    );
    screen.rerender(
      <LegalAcceptanceGate enabled>
        <MountCounter />
      </LegalAcceptanceGate>,
    );
    expect(screen.getByTestId("mount-count").props.children).toBe(1);
  });

  it("passes children through when enabled is false without spinner", async () => {
    const screen = render(
      <LegalAcceptanceGate enabled={false}>
        <Text>Checkout shell</Text>
      </LegalAcceptanceGate>,
    );
    expect(screen.getByText("Checkout shell")).toBeTruthy();
  });

  it("shows the EULA screen when enabled and not yet accepted", async () => {
    (hasAcceptedCurrentCustomerEula as jest.Mock).mockResolvedValue(false);
    const screen = render(
      <LegalAcceptanceGate enabled>
        <Text>App shell</Text>
      </LegalAcceptanceGate>,
    );
    await waitFor(() =>
      expect(screen.getByText("customer.mobile.components.legalAcceptanceGate.title")).toBeTruthy(),
    );
    expect(screen.queryByText("App shell")).toBeNull();
  });

  it("syncs legal acceptance once per user id despite new session object", async () => {
    mockUseAuth.mockReturnValue({ session: { user: { id: "u1" }, access_token: "a" } });
    const screen = render(
      <LegalAcceptanceGate enabled>
        <Text>App shell</Text>
      </LegalAcceptanceGate>,
    );
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));
    mockUseAuth.mockReturnValue({ session: { user: { id: "u1" }, access_token: "b" } });
    screen.rerender(
      <LegalAcceptanceGate enabled>
        <Text>App shell</Text>
      </LegalAcceptanceGate>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });
});
