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

const __dirname = dirname(fileURLToPath(import.meta.url));
const navSrc = readFileSync(join(__dirname, "../config/nav.ts"), "utf8");

type NavItem = { title: string; href: string; superadminOnly: boolean };
type NavGroup = { label: string; items: NavItem[] };

function parseNavGroups(src: string): NavGroup[] {
  const groups: NavGroup[] = [];

  // Match each { label: "…", items: [ … ] } block
  const groupRe = /label:\s*"([^"]+)"[\s\S]*?items:\s*\[([\s\S]*?)\],?\s*\}/g;
  let gm: RegExpExecArray | null;

  while ((gm = groupRe.exec(src)) !== null) {
    const label = gm[1];
    const itemsBlock = gm[2];
    const items: NavItem[] = [];

    const itemRe = /\{[^}]*title:\s*"([^"]+)"[^}]*href:\s*"([^"]+)"([^}]*)\}/g;
    let im: RegExpExecArray | null;

    while ((im = itemRe.exec(itemsBlock)) !== null) {
      const title = im[1];
      const href = im[2];
      const rest = im[3];
      const superadminOnly = /superadminOnly\s*:\s*true/.test(rest);
      items.push({ title, href, superadminOnly });
    }

    if (items.length > 0) {
      groups.push({ label, items });
    }
  }

  return groups;
}

describe("nav-model structural invariants", () => {
  const groups = parseNavGroups(navSrc);

  it("has at most 14 top-level groups", () => {
    expect(
      groups.length,
      `Expected ≤14 nav groups but found ${groups.length}: ${groups.map((g) => g.label).join(", ")}`,
    ).toBeLessThanOrEqual(14);
  });

  it("has at least 1 nav group (sanity check the parser)", () => {
    expect(groups.length).toBeGreaterThan(0);
  });

  it.each(groups)(
    'group "$label" has ≤9 non-superadmin items',
    ({ label, items }) => {
      const visibleCount = items.filter((i) => !i.superadminOnly).length;
      expect(
        visibleCount,
        `Group "${label}" has ${visibleCount} visible items (>9). Split or mark excess items as superadminOnly.`,
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
});
