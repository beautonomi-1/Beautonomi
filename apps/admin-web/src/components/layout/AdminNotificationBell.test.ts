import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bellSource = readFileSync(join(__dirname, "AdminNotificationBell.tsx"), "utf8");

describe("AdminNotificationBell error handling", () => {
  it("rethrows server errors for notifications so the badge keeps stale unread counts", () => {
    expect(bellSource).toMatch(/throw e;/);
    expect(bellSource).toMatch(/status === 401 \|\| e\.status === 403/);
    expect(bellSource).not.toMatch(
      /notifications[\s\S]*status >= 500[\s\S]*total_unread: 0/,
    );
  });

  it("rethrows server errors for activity queues", () => {
    expect(bellSource).not.toMatch(
      /activities[\s\S]*status >= 500[\s\S]*activities: \[\]/,
    );
  });
});
