/**
 * Guest cart writes are disabled — signed-out add/update/remove require sign-in.
 */
import { renderHook, act } from "@testing-library/react-native";

const mockUseAuth = jest.fn();

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("@/lib/cart-events", () => ({
  emitCartUpdated: jest.fn(),
  onCartUpdated: () => () => {},
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { useCart } from "@/features/shop/useCart";

describe("useCart guest policy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
  });

  it("rejects addToCart when signed out", async () => {
    const { result } = renderHook(() => useCart());

    let addResult: { error: string | null } | undefined;
    await act(async () => {
      addResult = await result.current.addToCart("prod-1", 1, null, {
        name: "Test",
        retail_price: 10,
        currency: "ZAR",
        provider_id: "p1",
        provider_name: "Salon",
        provider_slug: "salon",
      });
    });

    expect(addResult?.error).toMatch(/sign in/i);
  });
});
