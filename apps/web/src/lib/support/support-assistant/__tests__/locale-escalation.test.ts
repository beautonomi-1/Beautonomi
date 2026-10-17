import { describe, expect, it } from "vitest";
import { shouldEscalateAssistantForMessageLocale } from "../locale-escalation";

describe("shouldEscalateAssistantForMessageLocale", () => {
  it("does not escalate when reply locale is non-English", () => {
    expect(
      shouldEscalateAssistantForMessageLocale({
        userText: "Ngicela usizo ngokubhukha kwami",
        replyLocale: "zu",
      }),
    ).toBe(false);
  });

  it("escalates long non-Latin message when platform replies in English", () => {
    expect(
      shouldEscalateAssistantForMessageLocale({
        userText: "我需要帮助修改今天的预约，谢谢",
        replyLocale: "en",
      }),
    ).toBe(true);
  });
});
