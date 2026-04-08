import { describe, expect, it } from "vitest";
import { getOsTypeFromUserAgent } from "../os-type";

describe("getOsTypeFromUserAgent", () => {
  it("detects iPhone as ios", () => {
    expect(
      getOsTypeFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios");
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
      getOsTypeFromUserAgent("Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/534.30 (KHTML, like Gecko) Version/5.0 Mobile Safari/534.30")
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
