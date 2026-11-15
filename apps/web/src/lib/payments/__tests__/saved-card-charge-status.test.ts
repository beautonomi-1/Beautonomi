import { describe, expect, it } from "vitest";
import { classifySavedCardChargeStatus } from "../saved-card-charge-status";

describe("classifySavedCardChargeStatus", () => {
  it("maps success and failed", () => {
    expect(classifySavedCardChargeStatus("success")).toBe("success");
    expect(classifySavedCardChargeStatus("failed")).toBe("failed");
  });

  it("treats otp and 3DS as hosted fallback, and leaves a pending charge open", () => {
    expect(classifySavedCardChargeStatus("send_otp")).toBe("hosted_fallback");
    expect(classifySavedCardChargeStatus("send_pin")).toBe("hosted_fallback");
    expect(classifySavedCardChargeStatus("open_url")).toBe("hosted_fallback");
    expect(classifySavedCardChargeStatus("pending")).toBe("still_open");
    expect(classifySavedCardChargeStatus("ongoing")).toBe("still_open");
  });
});
