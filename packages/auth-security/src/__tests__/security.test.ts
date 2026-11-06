import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DEVICE_VERIFICATION_REQUIRED,
  IMPERSONATION_RESTRICTED,
  SecurityChallengeError,
  formatAvailableAt,
  isSecurityChallengeCode,
  isSecurityChallengeError,
  revokeTrustedDevice,
  securityErrorMessage,
  verifyDeviceCode,
  type SecurityApi,
} from "../index";

afterEach(() => {
  vi.useRealTimers();
});

describe("security challenge errors", () => {
  it("recognizes challenge codes and structural 403 errors", () => {
    expect(isSecurityChallengeCode(DEVICE_VERIFICATION_REQUIRED)).toBe(true);
    expect(isSecurityChallengeCode(IMPERSONATION_RESTRICTED)).toBe(true);
    expect(isSecurityChallengeCode("OTHER")).toBe(false);

    const err = new SecurityChallengeError("Verify this device", DEVICE_VERIFICATION_REQUIRED, {
      methods: ["email"],
    });
    expect(isSecurityChallengeError(err)).toBe(true);
    expect(isSecurityChallengeError({ status: 403, code: DEVICE_VERIFICATION_REQUIRED })).toBe(true);
    expect(isSecurityChallengeError({ status: 401, code: DEVICE_VERIFICATION_REQUIRED })).toBe(false);
    expect(isSecurityChallengeError(null)).toBe(false);
  });
});

describe("securityErrorMessage", () => {
  it("uses known copy and remaining attempts", () => {
    expect(securityErrorMessage(null)).toBe("Something went wrong. Try again.");
    expect(securityErrorMessage({ message: "nope", code: "CODE_EXPIRED" })).toBe(
      "That code has expired. Send a new one.",
    );
    expect(
      securityErrorMessage({
        message: "bad",
        code: "INVALID_CODE",
        details: { attempts_remaining: 1 },
      }),
    ).toBe("That code isn't right. Check it and try again. 1 attempt left.");
    expect(securityErrorMessage({ message: "Custom failure" })).toBe("Custom failure");
  });
});

describe("client flows", () => {
  it("strips non-digits before verifying a device code", async () => {
    const post = vi.fn(async () => ({ data: { status: "trusted" as const }, error: null }));
    const api = { get: vi.fn(), post } as unknown as SecurityApi;
    await verifyDeviceCode(api, "ch-1", "12-34 56");
    expect(post).toHaveBeenCalledWith("/api/auth/device/challenge/verify", {
      challenge_id: "ch-1",
      code: "123456",
    });
  });

  it("reports when device revoke is unsupported", async () => {
    const api = { get: vi.fn(), post: vi.fn() } as unknown as SecurityApi;
    await expect(revokeTrustedDevice(api, "dev/1")).resolves.toEqual({
      data: null,
      error: { message: "Not supported" },
    });
  });

  it("formats how long until a device hold lifts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
    expect(formatAvailableAt(null)).toBeNull();
    expect(formatAvailableAt("2026-11-06T09:00:00.000Z")).toBeNull();
    expect(formatAvailableAt("2026-11-06T10:20:00.000Z")).toBe("within the hour");
    expect(formatAvailableAt("2026-11-07T12:00:00.000Z")).toBe("in about 26 hours");
    expect(formatAvailableAt("2026-11-10T10:00:00.000Z")).toBe("in about 4 days");
  });
});
