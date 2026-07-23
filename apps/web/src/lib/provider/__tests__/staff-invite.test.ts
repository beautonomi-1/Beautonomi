import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildStaffJoinUrl,
  substituteTemplateVars,
  isStaffInviteTokenValid,
} from "../staff-invite";

describe("staff-invite helpers", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
  });

  it("buildStaffJoinUrl uses app base and token", () => {
    const url = buildStaffJoinUrl("11111111-1111-1111-1111-111111111111");
    expect(url).toBe(
      "https://app.example.com/provider/join?token=11111111-1111-1111-1111-111111111111",
    );
  });

  it("substituteTemplateVars replaces placeholders", () => {
    const out = substituteTemplateVars("Hi {{staff_name}} at {{business_name}}", {
      staff_name: "Sam",
      business_name: "Glow Salon",
    });
    expect(out).toBe("Hi Sam at Glow Salon");
  });

  it("isStaffInviteTokenValid rejects expired tokens", () => {
    expect(
      isStaffInviteTokenValid({
        is_active: true,
        invite_accepted_at: null,
        invite_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toBe(false);
  });

  it("isStaffInviteTokenValid accepts active unexpired tokens", () => {
    expect(
      isStaffInviteTokenValid({
        is_active: true,
        invite_accepted_at: null,
        invite_token_expires_at: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).toBe(true);
  });

  it("isStaffInviteTokenValid rejects already accepted invites", () => {
    expect(
      isStaffInviteTokenValid({
        is_active: true,
        invite_accepted_at: new Date().toISOString(),
        invite_token_expires_at: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).toBe(false);
  });

  it("isStaffInviteTokenValid rejects inactive staff", () => {
    expect(
      isStaffInviteTokenValid({
        is_active: false,
        invite_accepted_at: null,
        invite_token_expires_at: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).toBe(false);
  });
});
