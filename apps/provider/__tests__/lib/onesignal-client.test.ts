import {
  clearPendingPushNotification,
  enqueueOrRoutePushNotification,
  flushPendingPushNotification,
  setPushNavigationReady,
} from "@/lib/onesignal-client";

describe("onesignal-client push route queue", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearPendingPushNotification();
    setPushNavigationReady(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("queues routes until navigation is ready, then flushes", () => {
    const routed: Record<string, unknown>[] = [];
    const route = (payload: Record<string, unknown>) => routed.push(payload);

    enqueueOrRoutePushNotification({ type: "new_booking", booking_id: "b1" }, route);
    expect(routed).toHaveLength(0);

    setPushNavigationReady(true);
    flushPendingPushNotification(route);
    jest.advanceTimersByTime(400);
    expect(routed).toHaveLength(1);
    expect(routed[0]).toMatchObject({ booking_id: "b1" });
  });

  it("routes immediately when navigation is already ready", () => {
    const routed: Record<string, unknown>[] = [];
    const route = (payload: Record<string, unknown>) => routed.push(payload);

    setPushNavigationReady(true);
    enqueueOrRoutePushNotification({ type: "on_demand_incoming", on_demand_request_id: "r1" }, route);
    expect(routed).toHaveLength(1);
  });
});
