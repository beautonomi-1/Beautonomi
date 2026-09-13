import { describe, expect, it } from "vitest";
import { parseDisplayCurrencyCookie } from "../display-currency-cookie";

describe("parseDisplayCurrencyCookie", () => {
  it("parses bt_display_currency from cookie header", () => {
    expect(parseDisplayCurrencyCookie("foo=1; bt_display_currency=EUR; bar=2")).toBe("EUR");
  });

  it("returns null when absent", () => {
    expect(parseDisplayCurrencyCookie("bt_lang=en")).toBeNull();
  });

  it("accepts a bare cookie-store value", () => {
    expect(parseDisplayCurrencyCookie("usd")).toBe("USD");
  });
});
