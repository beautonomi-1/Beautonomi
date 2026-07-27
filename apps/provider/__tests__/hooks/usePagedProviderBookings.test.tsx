import React, { useState } from "react";
import { render, waitFor, act, fireEvent } from "@testing-library/react-native";
import { Text, View, Pressable, DeviceEventEmitter } from "react-native";
import { usePagedProviderBookings } from "@/hooks/usePagedProviderBookings";
import { PROVIDER_BOOKINGS_REFRESH_EVENT } from "@/lib/provider-bookings-events";
import { PROVIDER_BOOKINGS_PAGE_SIZE } from "@/lib/fetch-paged-provider-bookings";

jest.mock("@/lib/fetch-paged-provider-bookings", () => ({
  ...jest.requireActual("@/lib/fetch-paged-provider-bookings"),
  fetchProviderBookingsPage: jest.fn(),
  fetchAllProviderBookingsPages: jest.fn(),
}));

import {
  fetchProviderBookingsPage,
  fetchAllProviderBookingsPages,
} from "@/lib/fetch-paged-provider-bookings";

const pageMock = jest.mocked(fetchProviderBookingsPage);
const allMock = jest.mocked(fetchAllProviderBookingsPages);

function Harness({
  path,
  onSnap,
}: {
  path: string;
  onSnap?: (s: { len: number | null; err: string | null; loadingMore?: boolean }) => void;
}) {
  const { data, error, loading, loadingMore, refresh } = usePagedProviderBookings<{ id: string }>(path);
  const snap = JSON.stringify({
    len: data?.length ?? null,
    err: error,
    loading,
    loadingMore,
  });
  React.useEffect(() => {
    onSnap?.({ len: data?.length ?? null, err: error, loadingMore });
  }, [data, error, onSnap, loadingMore]);
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
    pageMock.mockReset();
    allMock.mockReset();
  });

  it("loads data for the current path", async () => {
    pageMock.mockResolvedValue([{ id: "1" }]);
    const { getByTestId } = render(<Harness path="/api/provider/bookings?d=1" />);
    await waitFor(() => {
      const t = getByTestId("snap").props.children;
      expect(t).toContain('"len":1');
    });
  });

  it("renders first page immediately then appends background pages", async () => {
    const page1 = Array.from({ length: PROVIDER_BOOKINGS_PAGE_SIZE }, (_, i) => ({ id: `p-${i}` }));
    let resolvePage2: (rows: { id: string }[]) => void = () => {};
    pageMock
      .mockResolvedValueOnce(page1)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePage2 = resolve;
          }),
      );
    const lengths: number[] = [];
    const { getByTestId } = render(
      <Harness
        path="/api/provider/bookings?progressive=1"
        onSnap={(s) => {
          if (s.len != null) lengths.push(s.len);
        }}
      />,
    );
    await waitFor(() => {
      expect(lengths).toContain(PROVIDER_BOOKINGS_PAGE_SIZE);
    });
    await act(async () => {
      resolvePage2([{ id: "extra" }]);
    });
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain(`"len":${PROVIDER_BOOKINGS_PAGE_SIZE + 1}`);
    });
    expect(pageMock).toHaveBeenCalledTimes(2);
  });

  it("discards superseded background pagination when refresh event fires", async () => {
    const page1 = Array.from({ length: PROVIDER_BOOKINGS_PAGE_SIZE }, (_, i) => ({ id: `old-${i}` }));
    pageMock.mockResolvedValueOnce(page1);
    let resolveSlowPage: (rows: { id: string }[]) => void = () => {};
    pageMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSlowPage = resolve;
        }),
    );
    pageMock.mockResolvedValueOnce([{ id: "fresh" }]);

    const { getByTestId } = render(<Harness path="/api/provider/bookings?race=1" />);
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain(`"len":${PROVIDER_BOOKINGS_PAGE_SIZE}`);
    });

    await act(async () => {
      DeviceEventEmitter.emit(PROVIDER_BOOKINGS_REFRESH_EVENT);
      resolveSlowPage([{ id: "stale-should-not-append" }]);
    });

    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain('"len":1');
    });
    expect(pageMock).toHaveBeenCalledTimes(3);
    expect(pageMock.mock.calls[2]?.[1]).toBe(0);
  });

  it("never shrinks an existing multi-page list while a silent refresh re-walks", async () => {
    const page = (prefix: string) =>
      Array.from({ length: PROVIDER_BOOKINGS_PAGE_SIZE }, (_, i) => ({ id: `${prefix}-${i}` }));
    // Initial walk: two full pages + a short page => 2001 rows.
    pageMock
      .mockResolvedValueOnce(page("a"))
      .mockResolvedValueOnce(page("b"))
      .mockResolvedValueOnce([{ id: "tail" }]);

    const lengths: number[] = [];
    const { getByTestId } = render(
      <Harness
        path="/api/provider/bookings?noshrink=1"
        onSnap={(s) => {
          if (s.len != null) lengths.push(s.len);
        }}
      />,
    );
    const fullLength = PROVIDER_BOOKINGS_PAGE_SIZE * 2 + 1;
    await waitFor(() => {
      expect(getByTestId("snap").props.children).toContain(`"len":${fullLength}`);
    });

    // Silent refresh (realtime/focus) re-walks the same three pages.
    lengths.length = 0;
    pageMock
      .mockResolvedValueOnce(page("a"))
      .mockResolvedValueOnce(page("b"))
      .mockResolvedValueOnce([{ id: "tail" }]);
    await act(async () => {
      DeviceEventEmitter.emit(PROVIDER_BOOKINGS_REFRESH_EVENT);
    });
    await waitFor(() => {
      expect(pageMock).toHaveBeenCalledTimes(6);
    });

    // The list is only ever published at full length — no intermediate truncation.
    expect(lengths.every((n) => n === fullLength)).toBe(true);
    expect(getByTestId("snap").props.children).toContain(`"len":${fullLength}`);
  });

  it("keeps previous data when refresh fails for the same path", async () => {
    pageMock.mockResolvedValueOnce([{ id: "a" }]).mockRejectedValueOnce(new Error("network"));
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

  it("silently refreshes when the app regains focus", async () => {
    pageMock.mockResolvedValueOnce([{ id: "1" }]).mockResolvedValueOnce([{ id: "1" }, { id: "2" }]);
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
});
