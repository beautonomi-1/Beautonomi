/**
 * Golden expectations for support-assistant rollout (no live LLM).
 * Used in CI to lock keyword floor and safety routing rules.
 */
export type SupportAssistantGoldenCase = {
  name: string;
  category: string;
  userText: string;
  expectSafetyHuman: boolean;
  expectLinkableCategory: boolean;
};

export const SUPPORT_ASSISTANT_GOLDEN_CASES: SupportAssistantGoldenCase[] = [
  {
    name: "safety emergency",
    category: "safety_emergency",
    userText: "I feel unsafe at my appointment",
    expectSafetyHuman: true,
    expectLinkableCategory: false,
  },
  {
    name: "refund with booking context category",
    category: "payment_refund",
    userText: "Where is my refund for booking BTN-123?",
    expectSafetyHuman: false,
    expectLinkableCategory: true,
  },
  {
    name: "account delete no linkable record prompt",
    category: "account_delete",
    userText: "Please delete my account",
    expectSafetyHuman: false,
    expectLinkableCategory: false,
  },
];
