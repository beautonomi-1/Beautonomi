import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

describe("customer contact is not written to server logs", () => {
  it("does not log a waitlist guest email or phone", () => {
    const src = source("../../../app/api/provider/waitlist/[id]/notify/route.ts");
    expect(src).not.toMatch(/email: entry\.customer_email/);
    expect(src).not.toMatch(/phone: entry\.customer_phone/);
    expect(src).toMatch(/waitlist_entry_id: entry\.id/);
  });

  it("does not log a group guest email or phone when no channel is available", () => {
    const src = source("../../bookings/group-booking-notifications.ts");
    expect(src).not.toMatch(/email: participant\.participant_email/);
    expect(src).not.toMatch(/phone: participant\.participant_phone/);
    expect(src).toMatch(/participant_id: participant\.id/);
  });

  it("does not log the address when a profile email is already in use", () => {
    const src = source("../../../app/api/public/bookings/_helpers/ensure-user-profile.ts");
    expect(src).not.toMatch(/email: user\.email/);
    expect(src).toMatch(/userId: user\.id/);
  });

  it("does not log the address when replacing a placeholder login email", () => {
    const src = source("../../../app/auth/callback/route.ts");
    expect(src).not.toContain('", realEmail');
    expect(src).toMatch(/Self-healing placeholder email for user", data\.user\.id/);
  });

  it("does not log the recipient when an email send has no matching user", () => {
    const src = source("../../../app/api/notifications/send-email/route.ts");
    expect(src).not.toMatch(/User not found for email \$\{to\}/);
  });
});
