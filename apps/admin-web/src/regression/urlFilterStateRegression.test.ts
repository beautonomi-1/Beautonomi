/**
 * Critical list pages must persist filters in URL search params (conventions §5).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..");

const CRITICAL_LIST_PAGES: { id: string; pageModule: string }[] = [
  { id: "bookings", pageModule: "routes/bookings/BookingsPage.tsx" },
  { id: "users", pageModule: "routes/users/UsersListPage.tsx" },
  { id: "support-tickets", pageModule: "routes/SupportTicketsPage.tsx" },
  { id: "payouts", pageModule: "routes/finance/PayoutsPage.tsx" },
  { id: "notifications-inbox", pageModule: "routes/NotificationsInboxPage.tsx" },
  { id: "provider-ops-leads", pageModule: "routes/provider-ops/ProviderOpsLeadsPage.tsx" },
];

describe("URL filter state regression (critical list pages)", () => {
  it.each(CRITICAL_LIST_PAGES)(
    "flow $id persists filters via useSearchParams in $pageModule",
    ({ pageModule, id }) => {
      const abs = join(srcRoot, pageModule);
      const src = readFileSync(abs, "utf8");
      expect(src, `${id}: import and call useSearchParams for shareable filter state`).toMatch(
        /\buseSearchParams\b/,
      );
    },
  );
});
