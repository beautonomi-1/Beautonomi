import { describe, expect, it } from "vitest";
import {
  PHONE_LOOKUP_CACHE_MS,
  generateTwilioVoiceAccessToken,
  isPhoneLookupCacheFresh,
  type TwilioVoiceCredentials,
} from "@/lib/integrations/twilio";

const voiceCreds: TwilioVoiceCredentials = {
  accountSid: "ACtest123",
  authToken: "auth",
  apiKeySid: "SKtest456",
  apiKeySecret: "secret-key-for-jwt-signing",
  twimlAppSid: "APtest789",
  voiceFrom: "+15551234567",
};

describe("generateTwilioVoiceAccessToken", () => {
  it("returns a three-part JWT", () => {
    const token = generateTwilioVoiceAccessToken(voiceCreds, "admin-user-uuid", 3600);
    expect(token.split(".")).toHaveLength(3);
  });

  it("embeds identity and voice grants in payload", () => {
    const token = generateTwilioVoiceAccessToken(voiceCreds, "admin-user-uuid", 3600);
    const payloadB64 = token.split(".")[1];
    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    expect(payload.grants.identity).toBe("admin-user-uuid");
    expect(payload.grants.voice.outgoing.application_sid).toBe("APtest789");
    expect(payload.iss).toBe("SKtest456");
    expect(payload.sub).toBe("ACtest123");
    expect(payload.exp - payload.iat).toBe(3600);
  });
});

describe("isPhoneLookupCacheFresh", () => {
  it("returns false when lookup_at is missing", () => {
    expect(isPhoneLookupCacheFresh(null)).toBe(false);
    expect(isPhoneLookupCacheFresh(undefined)).toBe(false);
  });

  it("returns true within cache window", () => {
    const recent = new Date(Date.now() - PHONE_LOOKUP_CACHE_MS + 60_000).toISOString();
    expect(isPhoneLookupCacheFresh(recent)).toBe(true);
  });

  it("returns false when cache expired", () => {
    const stale = new Date(Date.now() - PHONE_LOOKUP_CACHE_MS - 60_000).toISOString();
    expect(isPhoneLookupCacheFresh(stale)).toBe(false);
  });
});
