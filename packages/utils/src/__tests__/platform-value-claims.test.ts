import { describe, expect, it } from "vitest";
import {
  PLATFORM_ON_APP_PAYMENT_CLAIMS,
  providerNoFeeCashLossLine,
  providerPostCashCompleteShareLine,
  providerShareBookingLinkSms,
} from "../platform-value-claims";

const BANNED = [
  "AirCover",
  "BCover",
  "insured",
  "protected booking",
  "score customers see",
  "featured review",
];

function allClaimStrings(): string[] {
  return [
    ...Object.values(PLATFORM_ON_APP_PAYMENT_CLAIMS),
    providerShareBookingLinkSms("https://example.com/book/x"),
    providerPostCashCompleteShareLine("Sam"),
    providerNoFeeCashLossLine("Sam"),
  ];
}

describe("platform-value-claims", () => {
  it("does not contain banned marketing claims", () => {
    for (const s of allClaimStrings()) {
      for (const banned of BANNED) {
        expect(s.toLowerCase()).not.toContain(banned.toLowerCase());
      }
    }
  });
});
