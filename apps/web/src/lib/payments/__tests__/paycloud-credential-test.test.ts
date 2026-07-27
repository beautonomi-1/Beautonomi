import { describe, expect, it } from "vitest";
import {
  formatPaycloudCredentialTestMessage,
  isPaycloudCredentialTestPassing,
  isPaycloudGatewayReachable,
  isSynthesizedPaycloudHttpError,
} from "@/lib/payments/paycloud-credential-test";
import { buildPaycloudEntryUrl } from "@/lib/payments/paycloud-client";

describe("paycloud credential test verdict", () => {
  it("treats synthesized 503 as unreachable and failing", () => {
    const response = {
      success: false,
      raw: {},
      response_code: "503",
      error_message: "Card machine service error (503)",
    };
    expect(isSynthesizedPaycloudHttpError(response)).toBe(true);
    expect(isPaycloudGatewayReachable(response)).toBe(false);
    expect(isPaycloudCredentialTestPassing(response)).toBe(false);
    expect(formatPaycloudCredentialTestMessage(response, "https://example.test/orderquery")).toContain(
      "HTTP 503",
    );
  });

  it("passes when the gateway replies with an order-not-found envelope", () => {
    const response = {
      success: false,
      raw: { code: "404", msg: "order not found" },
      response_code: "404",
      error_message: "order not found",
    };
    expect(isPaycloudGatewayReachable(response)).toBe(true);
    expect(isPaycloudCredentialTestPassing(response)).toBe(true);
    expect(formatPaycloudCredentialTestMessage(response, "https://example.test")).toContain(
      "Credentials accepted",
    );
  });

  it("fails when the gateway rejects the signature", () => {
    const response = {
      success: false,
      raw: { code: "40004", msg: "sign verify failed" },
      response_code: "40004",
      error_message: "sign verify failed",
    };
    expect(isPaycloudGatewayReachable(response)).toBe(true);
    expect(isPaycloudCredentialTestPassing(response)).toBe(false);
    expect(formatPaycloudCredentialTestMessage(response, "https://example.test")).toContain(
      "rejected these credentials",
    );
  });
});

describe("buildPaycloudEntryUrl", () => {
  it("appends /api/entry when the base is a gateway root", () => {
    expect(buildPaycloudEntryUrl("https://addpay-open.wangtest.cn", "orderquery")).toBe(
      "https://addpay-open.wangtest.cn/api/entry/orderquery",
    );
  });

  it("does not double up when the base already includes /api/entry", () => {
    expect(buildPaycloudEntryUrl("https://addpay-open.wangtest.cn/api/entry/", "ecrorder")).toBe(
      "https://addpay-open.wangtest.cn/api/entry/ecrorder",
    );
  });
});
