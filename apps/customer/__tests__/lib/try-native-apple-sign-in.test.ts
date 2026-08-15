import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSignInAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("expo-apple-authentication", () => ({
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
  signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

import { tryNativeAppleSignIn } from "@/lib/auth/try-native-apple-sign-in";

describe("tryNativeAppleSignIn", () => {
  const supabase = {
    auth: {
      signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  };

  beforeEach(() => {
    mockSignInAsync.mockReset();
    mockIsAvailableAsync.mockReset();
    mockSignInWithIdToken.mockReset();
    mockUpdateUser.mockReset();
    mockIsAvailableAsync.mockResolvedValue(true);
    mockSignInWithIdToken.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
  });

  it("exchanges the native identity token with Supabase", async () => {
    mockSignInAsync.mockResolvedValue({
      identityToken: "jwt-token",
      fullName: { givenName: "Ada", familyName: "Lovelace" },
    });
    const result = await tryNativeAppleSignIn(supabase as never);
    expect(result).toEqual({ handled: true, error: null });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: "apple",
      token: "jwt-token",
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ data: { full_name: "Ada Lovelace" } });
  });

  it("treats user cancel as a handled cancel, not a crash", async () => {
    mockSignInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    const result = await tryNativeAppleSignIn(supabase as never);
    expect(result.handled).toBe(true);
    expect(result.error?.message).toBe("Sign-in was cancelled");
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });
});
