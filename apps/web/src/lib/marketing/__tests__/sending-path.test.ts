import { describe, expect, it } from "vitest";
import {
  hasOwnIntegrationForChannel,
  resolveMarketingSendingMode,
  shouldDebitPlatformCredits,
  willUsePlatformForChannel,
  type ProviderMarketingIntegrations,
} from "../sending-path";

const noOwn: ProviderMarketingIntegrations = {
  hasOwnEmail: false,
  hasOwnTwilioSms: false,
  hasOwnTwilioWhatsapp: false,
};

const ownTwilio: ProviderMarketingIntegrations = {
  hasOwnEmail: false,
  hasOwnTwilioSms: true,
  hasOwnTwilioWhatsapp: true,
};

describe("marketing sending-path", () => {
  it("uses platform when plan allows and no own integration for channel", () => {
    expect(willUsePlatformForChannel({ usePlatformCredentials: true }, noOwn, "sms")).toBe(true);
    expect(shouldDebitPlatformCredits({ usePlatformCredentials: true }, noOwn, "whatsapp")).toBe(true);
  });

  it("does not debit when own integration is configured for channel", () => {
    expect(willUsePlatformForChannel({ usePlatformCredentials: true }, ownTwilio, "sms")).toBe(false);
    expect(shouldDebitPlatformCredits({ usePlatformCredentials: true }, ownTwilio, "sms")).toBe(false);
    expect(willUsePlatformForChannel({ usePlatformCredentials: true }, ownTwilio, "email")).toBe(true);
  });

  it("does not use platform when plan flag is off", () => {
    expect(willUsePlatformForChannel({ usePlatformCredentials: false }, noOwn, "email")).toBe(false);
    expect(resolveMarketingSendingMode({ usePlatformCredentials: false }, noOwn)).toBe(
      "configure_integrations",
    );
  });

  it("prefers own integrations mode when any integration is connected", () => {
    expect(resolveMarketingSendingMode({ usePlatformCredentials: true }, ownTwilio)).toBe(
      "own_integrations",
    );
  });

  it("detects own integration per channel", () => {
    const mixed: ProviderMarketingIntegrations = {
      hasOwnEmail: true,
      hasOwnTwilioSms: false,
      hasOwnTwilioWhatsapp: false,
    };
    expect(hasOwnIntegrationForChannel(mixed, "email")).toBe(true);
    expect(hasOwnIntegrationForChannel(mixed, "sms")).toBe(false);
  });
});
