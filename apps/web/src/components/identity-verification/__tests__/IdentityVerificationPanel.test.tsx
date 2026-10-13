import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseIdentityVerificationReturn } from "@/hooks/useIdentityVerification";
import { IdentityVerificationPanel } from "../IdentityVerificationPanel";

const SESSION_URL = "https://verify.didit.me/session/panel-test";

const sdkShared = {
  onComplete: null as ((result: { type: string }) => void) | null,
  startVerification: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@didit-protocol/sdk-web", () => ({
  DiditSdk: { shared: sdkShared },
}));

vi.mock("@beautonomi/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  i18n: { t: (key: string) => key },
}));

vi.mock("../ConfirmLegalDetailsForm", () => ({
  ConfirmLegalDetailsForm: () => <div data-testid="confirm-form" />,
}));

vi.mock("../VerificationStatusCard", () => ({
  VerificationStatusCard: () => <div data-testid="status-card" />,
}));

const useIdentityVerificationMock = vi.fn();

vi.mock("@/hooks/useIdentityVerification", () => ({
  useIdentityVerification: (...args: unknown[]) => useIdentityVerificationMock(...args),
}));

function buildHookReturn(
  overrides: Partial<UseIdentityVerificationReturn> = {},
): UseIdentityVerificationReturn {
  return {
    status: "not_started",
    loading: false,
    launching: false,
    sessionToken: "tok",
    sessionUrl: SESSION_URL,
    isExisting: true,
    launchNonce: 1,
    legalDetails: {
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1990-05-15",
      country: "ZA",
    },
    setLegalDetails: vi.fn(),
    legalDetailsErrors: {},
    startVerification: vi.fn(),
    onSdkReturn: vi.fn(),
    retryVerification: vi.fn(),
    refresh: vi.fn(),
    error: null,
    ...overrides,
  };
}

function PanelWithNonce({ launchNonce }: { launchNonce: number }) {
  useIdentityVerificationMock.mockReturnValue(
    buildHookReturn({ launchNonce, sessionUrl: SESSION_URL }),
  );
  return <IdentityVerificationPanel persona="provider" />;
}

describe("IdentityVerificationPanel Didit launch", () => {
  beforeEach(() => {
    sdkShared.startVerification.mockClear();
    sdkShared.onComplete = null;
  });

  afterEach(() => {
    // Clears module-level activeSdkUrl guard in IdentityVerificationPanel
    sdkShared.onComplete?.({ type: "cancelled" });
    vi.clearAllMocks();
  });

  it("opens Didit when sessionUrl is set", async () => {
    useIdentityVerificationMock.mockReturnValue(buildHookReturn({ launchNonce: 1 }));

    render(<IdentityVerificationPanel persona="provider" />);

    await waitFor(() => {
      expect(sdkShared.startVerification).toHaveBeenCalledTimes(1);
    });
    expect(sdkShared.startVerification).toHaveBeenCalledWith({ url: SESSION_URL });
  });

  it("reopens Didit when launchNonce increments with the same sessionUrl", async () => {
    const { rerender } = render(<PanelWithNonce launchNonce={1} />);

    await waitFor(() => {
      expect(sdkShared.startVerification).toHaveBeenCalledTimes(1);
    });

    sdkShared.onComplete?.({ type: "cancelled" });

    rerender(<PanelWithNonce launchNonce={2} />);

    await waitFor(() => {
      expect(sdkShared.startVerification).toHaveBeenCalledTimes(2);
    });
    expect(sdkShared.startVerification).toHaveBeenLastCalledWith({ url: SESSION_URL });
  });
});
