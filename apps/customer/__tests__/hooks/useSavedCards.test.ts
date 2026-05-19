import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ApiResponse } from "@beautonomi/types";

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

import { api } from "@/lib/api-client";
import { useSavedCards } from "@/hooks/useSavedCards";

const apiGetMock = api.get as jest.MockedFunction<typeof api.get>;
const apiDeleteMock = api.delete as jest.MockedFunction<typeof api.delete>;

function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

describe("useSavedCards", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiDeleteMock.mockReset();
  });

  it("filters out inactive and expired cards from the list", async () => {
    apiGetMock.mockResolvedValueOnce(
      ok({
        data: [
          { id: "a", is_active: true, is_expired: false, last4: "1111" },
          { id: "b", is_active: true, is_expired: true, last4: "2222" },
          { id: "c", is_active: false, is_expired: false, last4: "3333" },
        ],
      } as unknown),
    );

    const { result } = renderHook(() => useSavedCards());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("calls DELETE /api/me/payment-methods/[id] when removing a card", async () => {
    apiGetMock.mockResolvedValueOnce(
      ok({
        data: [{ id: "a", is_active: true, is_expired: false, last4: "1111" }],
      } as unknown),
    );
    apiDeleteMock.mockResolvedValueOnce(ok({ success: true } as unknown));

    const { result } = renderHook(() => useSavedCards());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success = false;
    await act(async () => {
      success = await result.current.remove("a");
    });

    expect(success).toBe(true);
    expect(apiDeleteMock).toHaveBeenCalledTimes(1);
    expect(apiDeleteMock).toHaveBeenCalledWith("/api/me/payment-methods/a");
    expect(result.current.cards).toHaveLength(0);
  });

  it("returns false and leaves cards unchanged when the API rejects the delete", async () => {
    apiGetMock.mockResolvedValueOnce(
      ok({
        data: [{ id: "a", is_active: true, is_expired: false, last4: "1111" }],
      } as unknown),
    );
    apiDeleteMock.mockResolvedValueOnce({ data: null, error: { message: "nope" } });

    const { result } = renderHook(() => useSavedCards());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success = true;
    await act(async () => {
      success = await result.current.remove("a");
    });

    expect(success).toBe(false);
    expect(result.current.cards).toHaveLength(1);
  });
});
