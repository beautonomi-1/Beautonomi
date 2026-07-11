import { describe, expect, it } from "vitest";
import {
  DIDIT_SESSION_UNAVAILABLE_MESSAGE,
  formatDiditLaunchError,
  isDiditProviderLeakMessage,
  userFacingDiditSessionCreateMessage,
} from "../user-facing-didit-errors";

describe("user-facing-didit-errors", () => {
  it("detects Didit credits / billing leaks", () => {
    expect(
      isDiditProviderLeakMessage(
        "Failed to create Didit session: Didit API 400: you dont have enough credits to perform this request, please top up at https://business.didit.me",
      ),
    ).toBe(true);
  });

  it("session create always returns safe copy", () => {
    expect(userFacingDiditSessionCreateMessage(new Error("Didit API 400: credits"))).toBe(
      DIDIT_SESSION_UNAVAILABLE_MESSAGE,
    );
  });

  it("does not mention manual upload when disabled", () => {
    expect(
      formatDiditLaunchError("Didit API 400: enough credits", { manualAvailable: false }),
    ).toBe(DIDIT_SESSION_UNAVAILABLE_MESSAGE);
  });

  it("mentions manual upload only when enabled", () => {
    const msg = formatDiditLaunchError("Didit API 400: enough credits", {
      manualAvailable: true,
    });
    expect(msg.startsWith(DIDIT_SESSION_UNAVAILABLE_MESSAGE)).toBe(true);
    expect(msg).toContain("upload your ID below");
    expect(msg.toLowerCase()).not.toContain("credits");
    expect(msg.toLowerCase()).not.toContain("business.didit.me");
  });

  it("preserves non-leak messages when manual is off", () => {
    expect(
      formatDiditLaunchError("Please confirm your legal name first.", {
        manualAvailable: false,
      }),
    ).toBe("Please confirm your legal name first.");
  });
});
