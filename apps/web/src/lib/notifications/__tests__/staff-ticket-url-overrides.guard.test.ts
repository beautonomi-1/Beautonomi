import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const onesignalSource = readFileSync(join(__dirname, "../onesignal.ts"), "utf8");
const notificationServiceSource = readFileSync(join(__dirname, "../notification-service.ts"), "utf8");

describe("staff support ticket URL overrides (guard)", () => {
  it("sendTemplateNotification uses emailCtaPath for all email CTA enqueue sites", () => {
    const emailCtaAssignments = onesignalSource.match(/emailCtaWebUrl: emailCtaWebUrl/g) ?? [];
    expect(emailCtaAssignments.length).toBeGreaterThanOrEqual(3);
    expect(onesignalSource).toMatch(/const emailCtaWebUrl = options\?\.emailCtaPath/);
    expect(onesignalSource).not.toMatch(/emailCtaWebUrl: pushUrlFields\.webUrl/);
  });

  it("in-app insert prefers inAppActionUrl over template URL", () => {
    expect(onesignalSource).toMatch(/if \(options\?\.inAppActionUrl\?\.trim\(\)\)/);
    expect(onesignalSource).toMatch(/actionUrl = options\.inAppActionUrl\.trim\(\)/);
  });

  it("push payload still uses template pushUrlFields, not inAppActionUrl", () => {
    expect(onesignalSource).toMatch(/applyPushUrlToPayload\(notificationPayload, pushUrlFields\)/);
  });

  it("notifySupportStaffInboxActivity passes admin ticket paths", () => {
    expect(notificationServiceSource).toMatch(/inAppActionUrl: adminTicketPath/);
    expect(notificationServiceSource).toMatch(/emailCtaPath: adminTicketPath/);
    expect(notificationServiceSource).toMatch(
      /const adminTicketPath = `\/admin\/support-tickets\/\$\{ticketId\}`/,
    );
  });
});
