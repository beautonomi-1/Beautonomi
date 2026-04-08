import { describe, expect, it } from "vitest";
import { getOsTypeFromNavigator, getOsTypeFromUserAgent } from "../os-type";

describe("getOsTypeFromUserAgent", () => {
  it("detects iPhone as ios", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios");
  });

  it("does not misclassify iPhone as huawei", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(getOsTypeFromUserAgent(ua)).toBe("ios");
  });

  it("detects iPad classic UA as ios", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios");
  });

  it("detects iPad desktop-mode Safari as ios (Macintosh + Mobile)", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios");
  });

  it("detects stock Android as android (not huawei when UA contains 'premium' — false EMUI match)", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (Linux; Android 12; Premium-Device) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      )
    ).toBe("android");
  });

  it("detects stock Android as android", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      )
    ).toBe("android");
  });

  it("detects Huawei Android as huawei", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (Linux; Android 12; ELS-NX9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36 HuaweiBrowser/12.0.0.301"
      )
    ).toBe("huawei");
  });

  it("detects HarmonyOS-style UA without Android as huawei", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/534.30 (KHTML, like Gecko) Version/5.0 Mobile Safari/534.30"
      )
    ).toBe("huawei");
  });

  it("detects HMS Core hint as huawei on Android", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (Linux; Android 10; STK-L21) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36 HMSCore 6.4.0.312"
      )
    ).toBe("huawei");
  });

  it("detects Windows desktop", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      )
    ).toBe("desktop");
  });

  it("returns desktop for empty UA", () => {
    expect(getOsTypeFromUserAgent("")).toBe("desktop");
  });
});

describe("getOsTypeFromNavigator", () => {
  it("treats iPad desktop Safari as ios when MacIntel + touch points", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    } as unknown as Navigator;
    expect(getOsTypeFromNavigator(nav)).toBe("ios");
  });

  it("uses Client Hints platform iOS when available", () => {
    const nav = {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      userAgentData: { platform: "iOS" },
    } as unknown as Navigator;
    expect(getOsTypeFromNavigator(nav)).toBe("ios");
  });

  it("uses Client Hints Android + Huawei signals as huawei", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Linux; Android 12; ELS-NX9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Mobile Safari/537.36 HuaweiBrowser/12.0.0.301",
      userAgentData: { platform: "Android" },
    } as unknown as Navigator;
    expect(getOsTypeFromNavigator(nav)).toBe("huawei");
  });

  it("uses Client Hints Android without Huawei as android", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      userAgentData: { platform: "Android" },
    } as unknown as Navigator;
    expect(getOsTypeFromNavigator(nav)).toBe("android");
  });

  it("Client Hints macOS + touch is ios (iPad desktop site mode)", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
      userAgentData: { platform: "macOS" },
    } as unknown as Navigator;
    expect(getOsTypeFromNavigator(nav)).toBe("ios");
  });

  it("Client Hints macOS without touch stays non-ios for real Mac Safari UA", () => {
    const nav = {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 0,
      userAgentData: { platform: "macOS" },
    } as unknown as Navigator;
    expect(getOsTypeFromNavigator(nav)).toBe("desktop");
  });

  it("Chrome on iPhone (CriOS) is ios", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0.6045.109 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios");
  });

  it("does not classify iPad CPU OS line as huawei or android", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios");
  });
});
