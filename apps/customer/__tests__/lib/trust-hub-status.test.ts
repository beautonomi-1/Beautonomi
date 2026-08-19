import {
  countActiveSafetyRestrictions,
  hasEmergencyContact,
  maskPhoneForDisplay,
} from "@/lib/safety/trust-hub-status";

describe("trust-hub-status", () => {
  it("countActiveSafetyRestrictions excludes require_device_auth", () => {
    const count = countActiveSafetyRestrictions({
      restricted_mode: true,
      hide_social_feed: true,
      disable_comments_likes: false,
      disable_direct_messaging: false,
      sensitive_content_filter: false,
      require_device_auth: true,
    });
    expect(count).toBe(2);
  });

  it("maskPhoneForDisplay masks E.164 numbers", () => {
    expect(maskPhoneForDisplay("+27790624995")).toMatch(/4995$/);
    expect(maskPhoneForDisplay("")).toBeNull();
  });

  it("hasEmergencyContact requires name and phone", () => {
    expect(
      hasEmergencyContact({
        emergency_contact: { name: "Jane", phone: "+27123456789" },
      }),
    ).toBe(true);
    expect(
      hasEmergencyContact({
        emergency_contact: { name: "Jane", phone: "" },
      }),
    ).toBe(false);
  });
});
