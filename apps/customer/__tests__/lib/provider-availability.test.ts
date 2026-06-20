import { DeviceEventEmitter } from "react-native";

const mockEvict = jest.fn();
jest.mock("@/lib/api-response-cache", () => ({
  evictProviderFromApiCache: (...args: unknown[]) => mockEvict(...args),
}));

import {
  PROVIDER_UNAVAILABLE_EVENT,
  isProviderUnavailableError,
  emitProviderUnavailable,
  reportProviderUnavailable,
  type ProviderUnavailablePayload,
} from "@/lib/provider-availability";

describe("isProviderUnavailableError", () => {
  it.each([
    [{ status: 404 }, true],
    [{ status: 410 }, true],
    [{ code: "NOT_FOUND" }, true],
    [{ code: "GONE" }, true],
    [{ status: 404, code: "NOT_FOUND" }, true],
  ])("treats terminal gone signals as unavailable: %j", (error, expected) => {
    expect(isProviderUnavailableError(error)).toBe(expected);
  });

  it.each([
    [{ status: 500 }, false],
    [{ status: 503, code: "TENANT_UNAVAILABLE" }, false],
    [{ code: "NETWORK_ERROR" }, false],
    [{ code: "TIMEOUT" }, false],
    [{ code: "CANCELLED" }, false],
    [{ status: 401 }, false],
    [{ status: 403 }, false],
    [null, false],
    [undefined, false],
    ["some string", false],
  ])("treats transient/auth/other failures as recoverable: %j", (error, expected) => {
    expect(isProviderUnavailableError(error)).toBe(expected);
  });
});

describe("emitProviderUnavailable", () => {
  it("broadcasts the payload on PROVIDER_UNAVAILABLE_EVENT", () => {
    const received: ProviderUnavailablePayload[] = [];
    const sub = DeviceEventEmitter.addListener(
      PROVIDER_UNAVAILABLE_EVENT,
      (p: ProviderUnavailablePayload) => received.push(p),
    );
    emitProviderUnavailable({ providerId: "p1", slug: "salon-x" });
    sub.remove();
    expect(received).toEqual([{ providerId: "p1", slug: "salon-x" }]);
  });
});

describe("reportProviderUnavailable", () => {
  beforeEach(() => {
    mockEvict.mockClear();
  });

  it("evicts caches, broadcasts unavailable, and triggers a recover refetch", () => {
    const unavailable: ProviderUnavailablePayload[] = [];
    let recovered = 0;
    const subUnavailable = DeviceEventEmitter.addListener(
      PROVIDER_UNAVAILABLE_EVENT,
      (p: ProviderUnavailablePayload) => unavailable.push(p),
    );
    const subRecover = DeviceEventEmitter.addListener(
      "beautonomi:network:recover",
      () => {
        recovered += 1;
      },
    );

    reportProviderUnavailable({ providerId: "p1", slug: "salon-x" });

    subUnavailable.remove();
    subRecover.remove();

    expect(mockEvict).toHaveBeenCalledWith(["p1", "salon-x"]);
    expect(unavailable).toEqual([{ providerId: "p1", slug: "salon-x" }]);
    expect(recovered).toBe(1);
  });
});
