import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../../..");

describe("Slack EVENT_LABELS covers canonical keys", () => {
  it("every SLACK_EVENT_KEYS value has a label in SlackIntegrationPage", () => {
    const keysSrc = readFileSync(
      join(repoRoot, "apps/web/src/lib/integrations/slack/event-keys.ts"),
      "utf8",
    );
    const labelsSrc = readFileSync(
      join(repoRoot, "apps/admin-web/src/routes/integrations/SlackIntegrationPage.tsx"),
      "utf8",
    );
    const keys = [...keysSrc.matchAll(/:\s*"([a-z0-9_.]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(10);
    const missing = keys.filter((k) => !labelsSrc.includes(`"${k}"`));
    expect(missing, `EVENT_LABELS missing: ${missing.join(", ")}`).toEqual([]);
  });
});
