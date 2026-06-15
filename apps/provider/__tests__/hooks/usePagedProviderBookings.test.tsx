import React, { useState } from "react";
import { render, waitFor, act, fireEvent } from "@testing-library/react-native";
import { Text, View, Pressable, DeviceEventEmitter } from "react-native";
import { usePagedProviderBookings } from "@/hooks/usePagedProviderBookings";
import { PROVIDER_BOOKINGS_REFRESH_EVENT } from "@/lib/provider-bookings-events";

jest.mock("@/lib/fetch-paged-provider-bookings", () => ({
  ...jest.requireActual("@/lib/fetch-paged-provider-bookings"),
  fetchAllProviderBookingsPages: jest.fn(),
}));

import { fetchAllProviderBookingsPages } from "@/lib/fetch-paged-provider-bookings";

const fetchMock = jest.mocked(fetchAllProviderBookingsPages);

function Harness({
  path,
  onSnap,
}: {
  path: string;
  onSnap?: (s: { len: number | null; err: string | null }) => void;
}) {
  const { data, error, loading, refresh } = usePagedProviderBookings<{ id: string }>(path);
  const snap = JSON.stringify({
    len: data?.length ?? null,
    err: error,
    loading,
  });
  React.useEffect(() => {
    onSnap?.({ len: data?.length ?? null, err: error });
  }, [data, error, onSnap]);
  return (
    <View>
      <Text testID="snap">{snap}</Text>
      <Pressable testID="refresh" onPress={() => void refresh()}>
        <Text>Refresh</Text>
      </Pressable>
    </View>
  );
}

describe("usePagedProviderBookings", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("loads data for the current path", async () => {
    fetchMock.mockResolvedValue([{ id: "1" }]);
    const { getByTestId } = render(<Harness path="/api/provider/bookings?d=1" />);
    await waitFor(() => {
      const t = getByTestId("snap").props.children;
      expect(t).toContain('"len":1');
    });
  });

  it("keeps previous data when refresh fails for the same path", async () => {
    fetchMock.mockResolvedValueOnce([{ id: "a" }]).mockRejectedValueOnce(new Error("network"));
    const { getByTestId } = render(<Harness path="/api/provider/bookings?same=1" />);
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain('"len":1');
    });
    await act(async () => {
      fireEvent.press(getByTestId("refresh"));
    });
    await waitFor(() => {
      const t = getByTestId("snap").props.children as string;
      expect(t).toContain('"len":1');
      expect(t).toContain("network");
    });
  });

  it("clears data when a new path fails before any success for that path", async () => {
    fetchMock.mockResolvedValueOnce([{ id: "first" }]);
    const PathSwitcher = () => {
      const [p, setP] = useState("/api/provider/bookings?p=1");
      return (
        <View>
          <Harness path={p} />
          <Pressable testID="switch" onPress={() => setP("/api/provider/bookings?p=2")}>
            <Text>Switch</Text>
          </Pressable>
        </View>
      );
    };
    const { getByTestId } = render(<PathSwitcher />);
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain('"len":1');
    });
    fetchMock.mockRejectedValueOnce(new Error("bad range"));
    await act(async () => {
      fireEvent.press(getByTestId("switch"));
    });
    await waitFor(() => {
      const t = getByTestId("snap").props.children as string;
      expect(t).toContain('"len":null');
      expect(t).toContain("bad range");
    });
  });

  it("silently refreshes when the app regains focus", async () => {
    fetchMock.mockResolvedValueOnce([{ id: "1" }]).mockResolvedValueOnce([{ id: "1" }, { id: "2" }]);
    const { getByTestId } = render(<Harness path="/api/provider/bookings?focus=1" />);
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain('"len":1');
    });
    await act(async () => {
      DeviceEventEmitter.emit("beautonomi:app:focus");
    });
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain('"len":2');
    });
  });

  it("refreshes when the Bookings tab emits a refresh event", async () => {
    fetchMock.mockResolvedValueOnce([{ id: "a" }]).mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    const { getByTestId } = render(<Harness path="/api/provider/bookings?tab=1" />);
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain('"len":1');
    });
    await act(async () => {
      DeviceEventEmitter.emit(PROVIDER_BOOKINGS_REFRESH_EVENT);
    });
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain('"len":2');
    });
  });

  it("ignores CANCELLED errors during silent refresh", async () => {
    fetchMock.mockResolvedValueOnce([{ id: "keep" }]);
    const cancelled = Object.assign(new Error("Request cancelled"), { code: "CANCELLED" });
    fetchMock.mockRejectedValueOnce(cancelled);
    const { getByTestId } = render(<Harness path="/api/provider/bookings?cancel=1" />);
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain('"len":1');
    });
    await act(async () => {
      DeviceEventEmitter.emit(PROVIDER_BOOKINGS_REFRESH_EVENT);
    });
    await waitFor(() => {
      const t = getByTestId("snap").props.children as string;
      expect(t).toContain('"len":1');
      expect(t).not.toContain("cancelled");
    });
  });
});
