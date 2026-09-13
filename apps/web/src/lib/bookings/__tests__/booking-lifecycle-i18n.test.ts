import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOCALES = [
  "en",
  "en-GB",
  "af",
  "nso",
  "ss",
  "st",
  "tn",
  "ts",
  "ve",
  "xh",
  "zu",
] as const;

const REQUIRED_BOOKING_LIFECYCLE_KEYS = [
  "confirmationSla",
  "confirmationSlaLastMinute",
  "confirmationSlaOvernight",
  "awaitingCloseOut",
  "lateWindow",
  "runningLate",
  "runningLateReported",
  "runningLateAcknowledged",
  "closeOutBanner",
  "expiringSoonBanner",
  "pastSlotCancelWarning",
  "providerCreatedConfirmNote",
  "settingsConfirmationSlaHours",
  "settingsExpireHoursBeforeSlot",
  "settingsCloseoutGraceSalon",
  "settingsCloseoutGraceAtHome",
  "settingsLateArrivalGrace",
  "rebookAfterExpired",
] as const;

function loadLocale(code: string): Record<string, unknown> {
  const path = join(
    process.cwd(),
    "..",
    "..",
    "packages",
    "i18n",
    "src",
    "locales",
    `${code}.json`,
  );
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("booking lifecycle i18n contract", () => {
  it("includes every bookingLifecycle key in all 11 locales", () => {
    for (const code of LOCALES) {
      const json = loadLocale(code);
      const block = json.bookingLifecycle as Record<string, string> | undefined;
      expect(block, `${code}.bookingLifecycle`).toBeTruthy();
      for (const key of REQUIRED_BOOKING_LIFECYCLE_KEYS) {
        expect(typeof block?.[key], `${code}.bookingLifecycle.${key}`).toBe("string");
        expect(String(block?.[key] ?? "").length, `${code}.bookingLifecycle.${key}`).toBeGreaterThan(0);
      }
      const checkout = json.checkout as Record<string, string> | undefined;
      expect(typeof checkout?.pendingConfirmationSla, `${code}.checkout.pendingConfirmationSla`).toBe(
        "string",
      );
      expect(
        typeof checkout?.pendingConfirmationSlaLastMinute,
        `${code}.checkout.pendingConfirmationSlaLastMinute`,
      ).toBe("string");
    }
  });
});
