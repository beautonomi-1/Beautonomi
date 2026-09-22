import {
  coalesceStoreUrl,
  mergePublicAppsWithDefaults,
  NATIVE_STORE,
} from "@/lib/store/native-app-store";

describe("coalesceStoreUrl", () => {
  it("falls back on empty, hash, and whitespace", () => {
    const fb = NATIVE_STORE.customer.defaultAppStoreUrl;
    expect(coalesceStoreUrl("", fb)).toBe(fb);
    expect(coalesceStoreUrl("  ", fb)).toBe(fb);
    expect(coalesceStoreUrl("#", fb)).toBe(fb);
    expect(coalesceStoreUrl("https://example.com/app", fb)).toBe("https://example.com/app");
  });
});

describe("mergePublicAppsWithDefaults", () => {
  it("coalesces empty CMS iOS URL to canonical customer listing", () => {
    const merged = mergePublicAppsWithDefaults({
      customer: {
        ios: { app_store_url: "", enabled: true },
      },
    });
    expect(merged.customer.ios.app_store_url).toBe(NATIVE_STORE.customer.defaultAppStoreUrl);
  });
});
