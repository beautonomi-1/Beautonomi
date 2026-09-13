import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { persistClientDisplayCurrency } from "../persist-client-display-currency";
import {
  DISPLAY_CURRENCY_COOKIE,
  DISPLAY_CURRENCY_STORAGE_KEY,
} from "../display-currency-cookie";

describe("persistClientDisplayCurrency", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
    document.cookie = `${DISPLAY_CURRENCY_COOKIE}=; Max-Age=0; Path=/`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes cookie and localStorage and dispatches event", () => {
    const handler = vi.fn();
    window.addEventListener("beautonomi:preferred-display-currency-changed", handler);

    const code = persistClientDisplayCurrency("usd");
    expect(code).toBe("USD");
    expect(localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY)).toBe("USD");
    expect(document.cookie).toContain(`${DISPLAY_CURRENCY_COOKIE}=USD`);
    expect(handler).toHaveBeenCalled();
  });
});
