import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CRITICAL_ADMIN_FLOWS } from "./criticalFlows";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..");

/**
 * Pages that fetch admin data should surface loading and/or error UX (conventions §8).
 * Login uses form state instead of query skeletons.
 */
const LOADING_OR_ERROR_PATTERN =
  /\b(AdminPageSkeleton|AdminQueryBlock|AdminRetryBlock|query\.isLoading|query\.isPending|q\.isLoading|q\.isPending|isLoading|isPending|PermissionDenied|AdminMutationAlert|useAdminSectionPage|useSuperadminPage)\b/;

describe("loading / error surface regression (critical pages)", () => {
  it.each(CRITICAL_ADMIN_FLOWS.filter((f) => f.id !== "login"))(
    "flow $id exposes loading or error handling patterns",
    ({ pageModule, id }) => {
      const abs = join(srcRoot, pageModule);
      const src = readFileSync(abs, "utf8");
      expect(src, `${id}: add skeleton, AdminQueryBlock, AdminRetryBlock, or query loading flags`).toMatch(
        LOADING_OR_ERROR_PATTERN
      );
    }
  );

  it("login page shows form and error alert patterns", () => {
    const abs = join(srcRoot, "routes/LoginPage.tsx");
    const src = readFileSync(abs, "utf8");
    expect(src).toMatch(/role=["']alert["']/);
    expect(src).toMatch(/Sign in|Signing in/i);
  });
});
