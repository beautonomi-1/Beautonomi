import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";
import { Text, View, DeviceEventEmitter } from "react-native";

const mockApiGet = jest.fn();

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "customer-user" } } }),
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

import { useApi, clearApiCache } from "@/hooks/useApi";

type Payload = { items: { id: string }[] };

function Harness({ path }: { path: string }) {
  const { data, loading, error } = useApi<Payload>(path);
  return (
    <View>
      <Text testID="snap">
        {JSON.stringify({ rows: data?.items?.length ?? null, loading, error })}
      </Text>
    </View>
  );
}

describe("useApi authorization failure handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearApiCache();
  });

  it("stops re-requesting a role-gated path on resume after a 403", async () => {
    mockApiGet.mockResolvedValue({
      data: null,
      error: { message: "Insufficient permissions", code: "FORBIDDEN", status: 403 },
    });

    const { getByTestId } = render(<Harness path="/api/me/notifications?counts_only=1" />);

    await waitFor(
      () => {
        const snap = JSON.parse(getByTestId("snap").props.children);
        expect(snap.loading).toBe(false);
        expect(snap.error).toBe("Insufficient permissions");
      },
      { timeout: 10_000 },
    );

    const callsAfterMount = mockApiGet.mock.calls.length;

    await act(async () => {
      DeviceEventEmitter.emit("beautonomi:app:focus");
      DeviceEventEmitter.emit("beautonomi:network:recover");
      await new Promise((resolve) => setTimeout(resolve, 2500));
    });

    // Resuming cannot grant a role the session doesn't have, so the request
    // must not be repeated on every foreground.
    expect(mockApiGet.mock.calls.length).toBe(callsAfterMount);
  });

  it("still revalidates on resume after a successful load", async () => {
    mockApiGet.mockResolvedValue({ data: { items: [{ id: "a" }] }, error: null });

    const { getByTestId } = render(<Harness path="/api/me/conversations" />);

    await waitFor(
      () => {
        const snap = JSON.parse(getByTestId("snap").props.children);
        expect(snap.rows).toBe(1);
      },
      { timeout: 10_000 },
    );

    const callsAfterMount = mockApiGet.mock.calls.length;

    await act(async () => {
      DeviceEventEmitter.emit("beautonomi:app:focus");
      await new Promise((resolve) => setTimeout(resolve, 2500));
    });

    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
