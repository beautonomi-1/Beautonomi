import React from "react";
import { render, waitFor, act } from "@testing-library/react-native";
import { Text, View, DeviceEventEmitter } from "react-native";

const mockApiGet = jest.fn();

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "provider-user" } } }),
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

jest.mock("@/lib/sentry", () => ({
  captureApiFailure: jest.fn(),
}));

jest.mock("@/config/public-env", () => ({
  getRuntimeMarketHost: () => "test-host",
}));

import { useApi, clearApiCache } from "@/hooks/useApi";

type LedgerPayload = { transactions: { id: string }[] };

function Harness({ path }: { path: string }) {
  const { data, loading, error, errorCode } = useApi<LedgerPayload>(path);
  return (
    <View>
      <Text testID="snap">
        {JSON.stringify({
          rows: data?.transactions?.length ?? null,
          loading,
          error,
          errorCode,
        })}
      </Text>
    </View>
  );
}

describe("useApi transient failure handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearApiCache();
  });

  it("surfaces a retryable error when a foreground load times out with nothing cached", async () => {
    mockApiGet.mockResolvedValue({
      data: null,
      error: { message: "Request timed out.", code: "TIMEOUT" },
    });

    const { getByTestId } = render(<Harness path="/api/provider/transactions?period=month" />);

    await waitFor(() => {
      const snap = JSON.parse(getByTestId("snap").props.children);
      expect(snap.loading).toBe(false);
      expect(snap.errorCode).toBe("TIMEOUT");
      expect(snap.error).toBe("Request timed out.");
      expect(snap.rows).toBeNull();
    });
  });

  it("surfaces network failures so the UI can offer Retry instead of a false empty state", async () => {
    mockApiGet.mockResolvedValue({
      data: null,
      error: { message: "Network request failed", code: "NETWORK_ERROR" },
    });

    const { getByTestId } = render(<Harness path="/api/provider/sales-history?page=1" />);

    await waitFor(() => {
      const snap = JSON.parse(getByTestId("snap").props.children);
      expect(snap.loading).toBe(false);
      expect(snap.errorCode).toBe("NETWORK_ERROR");
    });
  });

  it("stays silent on CANCELLED because backgrounding guarantees a resume refetch", async () => {
    mockApiGet.mockResolvedValue({
      data: null,
      error: { message: "Request cancelled.", code: "CANCELLED" },
    });

    const { getByTestId } = render(<Harness path="/api/provider/transactions?period=week" />);

    await waitFor(() => {
      const snap = JSON.parse(getByTestId("snap").props.children);
      expect(snap.loading).toBe(false);
    });

    const snap = JSON.parse(getByTestId("snap").props.children);
    expect(snap.error).toBeNull();
    expect(snap.errorCode).toBeNull();
  });

  it("stops re-requesting a role-gated path on resume after a 403", async () => {
    mockApiGet.mockResolvedValue({
      data: null,
      error: { message: "Insufficient permissions", code: "FORBIDDEN", status: 403 },
    });

    const { getByTestId } = render(<Harness path="/api/provider/nav-counts" />);

    await waitFor(
      () => {
        const snap = JSON.parse(getByTestId("snap").props.children);
        expect(snap.errorCode).toBe("FORBIDDEN");
      },
      { timeout: 10_000 },
    );

    const callsAfterMount = mockApiGet.mock.calls.length;

    await act(async () => {
      DeviceEventEmitter.emit("beautonomi:app:focus");
      DeviceEventEmitter.emit("beautonomi:network:recover");
      await new Promise((resolve) => setTimeout(resolve, 2500));
    });

    // Onboarding users lack the provider role for the whole wizard; resuming
    // cannot change that, so the request must not be repeated.
    expect(mockApiGet.mock.calls.length).toBe(callsAfterMount);
  });

  it("keeps cached data on screen when a background revalidate fails", async () => {
    mockApiGet.mockResolvedValueOnce({
      data: { transactions: [{ id: "t1" }] },
      error: null,
    });

    const { getByTestId } = render(<Harness path="/api/provider/transactions?period=year" />);

    await waitFor(() => {
      const snap = JSON.parse(getByTestId("snap").props.children);
      expect(snap.rows).toBe(1);
    });

    mockApiGet.mockResolvedValue({
      data: null,
      error: { message: "Request timed out.", code: "TIMEOUT" },
    });

    await act(async () => {
      DeviceEventEmitter.emit("beautonomi:app:focus");
      await new Promise((resolve) => setTimeout(resolve, 2500));
    });

    const snap = JSON.parse(getByTestId("snap").props.children);
    expect(snap.rows).toBe(1);
    expect(snap.error).toBeNull();
  });
});
