jest.mock("@/config/public-env", () => ({
  APP_URL: "https://www.beautonomi.com",
  getBackendUrl: () => "https://www.beautonomi.com",
  WEB_API_TENANT_HOST: "",
  GLOBAL_ENTRY_HOST: "",
  DEFAULT_MARKET_HOST: "",
}));

import { isAllowedInAppWebViewUrl } from "@/lib/webview-allowlist";
import { shouldCancelInAppNavigation, shouldOpenInSystemBrowser } from "@/lib/webview-navigation";

describe("webview-navigation", () => {
  it("does not open vercel.live in the system browser", () => {
    expect(shouldOpenInSystemBrowser("https://vercel.live/foo")).toBe(false);
    expect(shouldCancelInAppNavigation("https://vercel.live/foo")).toBe(true);
    expect(isAllowedInAppWebViewUrl("https://vercel.live/foo")).toBe(false);
  });

  it("opens unknown https hosts in the system browser", () => {
    expect(shouldOpenInSystemBrowser("https://example-unknown-host.test/page")).toBe(true);
    expect(shouldCancelInAppNavigation("https://example-unknown-host.test/page")).toBe(false);
  });
});
