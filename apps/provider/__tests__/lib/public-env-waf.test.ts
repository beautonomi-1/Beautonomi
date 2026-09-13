import {
  MOBILE_WEB_USER_AGENT_TOKEN,
  withWebApiTenantHeaders,
} from "@/config/public-env";

jest.mock("@/lib/market/active-market-host", () => ({
  getActiveMarketHostSync: jest.fn(() => ""),
}));

describe("withWebApiTenantHeaders", () => {
  it("adds X-App and BeautonomiApp User-Agent for WAF bypass", () => {
    const init = withWebApiTenantHeaders();
    const headers = init.headers as Headers;
    expect(headers.get("X-App")).toBe("provider");
    expect(headers.get("User-Agent")).toBe(MOBILE_WEB_USER_AGENT_TOKEN);
  });

  it("does not overwrite an explicit User-Agent", () => {
    const init = withWebApiTenantHeaders({
      headers: { "User-Agent": "custom-agent" },
    });
    const headers = init.headers as Headers;
    expect(headers.get("User-Agent")).toBe("custom-agent");
  });
});
