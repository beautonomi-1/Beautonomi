import { redirectLoginIfAuthRequired } from "@/lib/customer-auth-routing";

const mockReplace = jest.fn();
const mockGetSession = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock("@/lib/api-client", () => ({
  api: {},
}));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

jest.mock("@/lib/sentry", () => ({
  authFlowBreadcrumb: jest.fn(),
  isSentryEnabled: () => false,
  withAuthNavigationSpan: async (_name: string, fn: () => Promise<unknown>) => fn(),
}));

describe("redirectLoginIfAuthRequired", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockGetSession.mockReset();
  });

  it("does not bounce to login when a session token is still present", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    const redirected = await redirectLoginIfAuthRequired("/(app)/book-checkout?hold_id=abc", {
      status: 401,
      code: "AUTH_REQUIRED",
    });
    expect(redirected).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("sends the user to login with return_to when there is no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const redirected = await redirectLoginIfAuthRequired("/(app)/book-checkout?hold_id=abc", {
      status: 401,
      code: "AUTH_REQUIRED",
    });
    expect(redirected).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/(auth)/login",
      params: { return_to: "/(app)/book-checkout?hold_id=abc" },
    });
  });
});
