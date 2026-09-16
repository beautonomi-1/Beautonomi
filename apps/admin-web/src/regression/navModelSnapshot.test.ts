/**
 * Nav-model structural invariants.
 *
 * These tests enforce the 13-section IA constraints from the Super Admin
 * Portal Redesign Blueprint so regressions are caught at CI rather than
 * discovered in production.
 *
 * Rules:
 *  1. ≤13 top-level groups.
 *  2. Each group has ≤9 non-superadmin items (superadmin-only items are
 *     hidden from regular admins, so they are excluded from the visible
 *     item count — see nav.ts comment).
 *  3. No duplicate hrefs across all nav items.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { flattenNavItems, NAV_GROUPS, type NavItemConfig } from "../config/nav";

const __dirname = dirname(fileURLToPath(import.meta.url));

type NavItem = { title: string; href: string; superadminOnly: boolean };
type NavGroup = { label: string; items: NavItem[] };

function toFlatItems(groups: typeof NAV_GROUPS): NavGroup[] {
  return groups.map((group) => ({
    label: group.label,
    items: flattenNavItems([group]).map((item) => ({
      title: item.title,
      href: item.href,
      superadminOnly: item.superadminOnly === true,
    })),
  }));
}

function countVisibleTopLevel(items: NavItemConfig[]): number {
  return items.reduce((count, item) => {
    const visible = item.superadminOnly !== true ? 1 : 0;
    return count + visible;
  }, 0);
}

describe("nav-model structural invariants", () => {
  const groups = toFlatItems(NAV_GROUPS);
  const topLevelGroups = NAV_GROUPS.map((g) => ({
    label: g.label,
    visibleCount: countVisibleTopLevel(g.items),
  }));

  it("has at most 14 top-level groups", () => {
    expect(
      groups.length,
      `Expected ≤14 nav groups but found ${groups.length}: ${groups.map((g) => g.label).join(", ")}`,
    ).toBeLessThanOrEqual(14);
  });

  it("has at least 1 nav group (sanity check the parser)", () => {
    expect(groups.length).toBeGreaterThan(0);
  });

  it.each(topLevelGroups)(
    'group "$label" has ≤9 non-superadmin top-level items',
    ({ label, visibleCount }) => {
      expect(
        visibleCount,
        `Group "${label}" has ${visibleCount} visible top-level items (>9). Nest under a hub or mark excess items as superadminOnly.`,
      ).toBeLessThanOrEqual(9);
    },
  );

  it("has no duplicate hrefs", () => {
    const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const href of allHrefs) {
      if (seen.has(href)) {
        duplicates.push(href);
      } else {
        seen.add(href);
      }
    }

    expect(duplicates, `Duplicate hrefs found: ${duplicates.join(", ")}`).toHaveLength(0);
  });

  it("has no duplicate nav item titles", () => {
    const allTitles = groups.flatMap((g) => g.items.map((i) => i.title));
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const title of allTitles) {
      if (seen.has(title)) {
        duplicates.push(title);
      } else {
        seen.add(title);
      }
    }

    expect(duplicates, `Duplicate nav titles found: ${duplicates.join(", ")}`).toHaveLength(0);
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip `/admin` prefix from nav hrefs to match App.tsx route paths. */
function navHrefAppPaths(): string[] {
  const hrefs = flattenNavItems(NAV_GROUPS).map((item) =>
    item.href.replace(/^\/admin\//, "").replace(/\/$/, ""),
  );
  return [...new Set(hrefs)];
}

function appRegistersPath(adminRelPath: string, appSrc: string): boolean {
  if (adminRelPath === "custom-fields") {
    return (
      new RegExp(`path="${escapeRe("custom-fields")}"`).test(appSrc) ||
      appSrc.includes("settings/custom-fields")
    );
  }

  if (adminRelPath.startsWith("control-plane/")) {
    const child = adminRelPath.slice("control-plane/".length);
    return (
      appSrc.includes('path="control-plane"') && new RegExp(`path="${escapeRe(child)}"`).test(appSrc)
    );
  }

  return new RegExp(`path="${escapeRe(adminRelPath)}"`).test(appSrc);
}

describe("nav hrefs resolve in App.tsx", () => {
  const appSrc = readFileSync(join(__dirname, "../App.tsx"), "utf8");

  it.each(navHrefAppPaths())("nav href /admin/%s is registered", (p) => {
    expect(appRegistersPath(p, appSrc), `Missing route for /admin/${p}`).toBe(true);
  });
});
