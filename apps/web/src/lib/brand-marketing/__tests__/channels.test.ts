import { describe, expect, it } from "vitest";
import { BRAND_CHANNEL_GROUPS, lineTypeForChannelKey } from "../channels";
import { BRAND_BRIEF_TEMPLATES } from "../templates";
import { UNATTRIBUTABLE_CHANNELS } from "../types";

describe("brand channels", () => {
  it("maps waitlist to owned", () => {
    expect(lineTypeForChannelKey("waitlist")).toBe("owned");
  });

  it("maps google to paid", () => {
    expect(lineTypeForChannelKey("google")).toBe("paid");
  });

  it("maps provider_leads and referral to owned", () => {
    expect(lineTypeForChannelKey("provider_leads")).toBe("owned");
    expect(lineTypeForChannelKey("referral")).toBe("owned");
  });

  it("maps every unattributable channel to offline", () => {
    for (const ch of UNATTRIBUTABLE_CHANNELS) {
      expect(lineTypeForChannelKey(ch)).toBe("offline");
    }
  });

  it("only uses known channels in brief templates", () => {
    const known = new Set<string>(Object.values(BRAND_CHANNEL_GROUPS).flat());
    for (const t of Object.values(BRAND_BRIEF_TEMPLATES)) {
      for (const ch of t.channels_requested) {
        expect(known.has(ch), ch).toBe(true);
      }
    }
  });
});
