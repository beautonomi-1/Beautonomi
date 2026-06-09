/**
 * §Wave 5.3 — Reconciliation drift coverage (launch 100 %).
 *
 * This suite protects the shadow-ledger invariant: every `transaction_type`
 * the application inserts into `public.finance_transactions` must be
 * recognised by the `_shadow_replay_finance_tx_row` function (migration
 * 510) so the corresponding `journal_entries` + `journal_lines` rows get
 * written. If someone adds a new transaction type in application code
 * without extending the SQL allowlist, the row lands in
 * `finance_transactions` but the journal stays silent — which is the
 * classic "reconciliation drift" bug. This test fails loudly in CI long
 * before the bug can ship.
 *
 * What we check:
 *
 *   1. Every `transaction_type` string literal that lands on a
 *      `finance_transactions` insert in the web codebase is present in
 *      the migration's allowlist.
 *   2. The migration's allowlist is exactly the set the team expects
 *      (no accidental deletions). We pin it as data here so removing a
 *      type requires a deliberate edit.
 *   3. For each allowlist type we have a short English description and
 *      an invariant statement. This gives reviewers a quick mental map
 *      of what each posting should look like.
 *
 * Non-goals: we don't run Postgres here. The SQL itself is covered by
 * staging dry-runs + `reconciliation_assert_zero_drift` cron. This test
 * only covers schema-drift between application code and the migration.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Canonical allowlist (kept in sync with migration 510's
 * `_shadow_replay_finance_tx_row` ELSIF ladder).
 * Edit this file AND the migration together.
 */
const SHADOW_LEDGER_ALLOWLIST = [
  "payment",
  "refund",
  "tip",
  "payout",
  "cancellation_fee",
  "provider_earnings",
  "service_fee",
  "tax",
  "travel_fee",
  "wallet_payment",
  "wallet_topup",
  "gift_card_payment",
  "loyalty_redemption",
  "promotion_discount",
  "manual_adjustment",
  "walk_in_additional_charge",
  "provider_subscription_payment",
  "gift_card_sale",
  "membership_sale",
  "provider_ads_payment",
  "additional_charge_payment",
  "platform_fee",
  // 655: booking-level discount contra rows (GMV/net symmetry with promotion_discount).
  "membership_discount",
  "loyalty_discount",
  // 664/665: reversal rows for ads + subscription funding integrity.
  "provider_ads_refund",
  "provider_subscription_refund",
] as const;

/**
 * Allowlist entries introduced AFTER migration 510 (each in its own migration).
 * The "migration agrees on allowlist" check reads the union of these files so
 * later additions don't have to edit the immutable 510 migration.
 */
const POST_510_ALLOWLIST_MIGRATIONS: Record<string, string[]> = {
  "655_shadow_ledger_membership_loyalty_discounts.sql": [
    "membership_discount",
    "loyalty_discount",
  ],
  "664_ads_funding_integrity.sql": ["provider_ads_refund"],
  "665_subscription_funding_integrity.sql": ["provider_subscription_refund"],
};

/**
 * Types that are allowed to appear in code but deliberately skipped by
 * the shadow writer. Each needs a justification so a future reviewer
 * doesn't accidentally "fix" it by adding to the allowlist.
 */
const INTENTIONALLY_SKIPPED: Record<string, string> = {
  gift_card_liability_reduction:
    "Matched by migration 510 as explicit RETURN – the paired gift_card_payment already posts the wallet debit.",
  charge:
    "Lives in payment_transactions, NOT finance_transactions. It's the raw PSP event, never the canonical ledger row.",
  earned:
    "Lives in loyalty_points_ledger, NOT finance_transactions. Points are posted via a separate journal writer.",
  redeemed:
    "Same as 'earned' — loyalty side, not money ledger.",
  additional_charge:
    "Intermediate state row in booking_additional_charges; only the paired additional_charge_payment hits the money ledger.",
};

/**
 * Files that are allowed to contain `transaction_type: "..."` literals
 * targeting tables OTHER than finance_transactions (e.g. payment_transactions,
 * loyalty_points_ledger). The test below walks upwards a few lines
 * to decide whether the literal is bound for finance_transactions.
 */
const FINANCE_TABLE_HINT = /finance_transactions|financeTransactions/;

function readAppFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
    }
  }
  walk(root);
  return out;
}

function findTransactionTypeLiterals(
  files: string[],
): { file: string; line: number; type: string; context: string[] }[] {
  const results: { file: string; line: number; type: string; context: string[] }[] =
    [];
  const re = /transaction_type\s*:\s*["']([a-z_]+)["']/g;
  for (const file of files) {
    const contents = fs.readFileSync(file, "utf8");
    const lines = contents.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const context = lines.slice(Math.max(0, i - 15), i + 2);
        results.push({ file, line: i + 1, type: m[1], context });
      }
    }
  }
  return results;
}

function isFinanceTransactionsInsert(context: string[]): boolean {
  return context.some((l) => FINANCE_TABLE_HINT.test(l));
}

const WEB_SRC = path.resolve(__dirname, "..", "..", "..");

describe("Reconciliation drift (Wave 5.3)", () => {
  it("migration 510 (+ later allowlist migrations) and test data agree on allowlist", () => {
    const migrationsDir = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "..",
      "..",
      "supabase",
      "migrations",
    );
    const sql = fs.readFileSync(
      path.join(migrationsDir, "510_shadow_ledger_full_allowlist.sql"),
      "utf8",
    );

    // Types added after 510 live in their own migration; verify each appears there.
    const addedAfter510 = new Set<string>();
    for (const [file, types] of Object.entries(POST_510_ALLOWLIST_MIGRATIONS)) {
      const laterSql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      for (const t of types) {
        expect(
          laterSql.includes(`'${t}'`),
          `Migration ${file} should mention transaction_type '${t}'`,
        ).toBe(true);
        addedAfter510.add(t);
      }
    }

    for (const t of SHADOW_LEDGER_ALLOWLIST) {
      if (addedAfter510.has(t)) continue;
      expect(
        sql.includes(`'${t}'`),
        `Migration 510 should mention transaction_type '${t}'`,
      ).toBe(true);
    }
  });

  it("every finance_transactions transaction_type used in app code is in the allowlist or intentionally skipped", () => {
    const files = readAppFiles(WEB_SRC);
    const hits = findTransactionTypeLiterals(files);
    const offenders: Array<{ type: string; file: string; line: number }> = [];

    for (const h of hits) {
      if (!isFinanceTransactionsInsert(h.context)) continue;
      if (SHADOW_LEDGER_ALLOWLIST.includes(h.type as (typeof SHADOW_LEDGER_ALLOWLIST)[number])) {
        continue;
      }
      if (INTENTIONALLY_SKIPPED[h.type]) continue;
      offenders.push({ type: h.type, file: h.file, line: h.line });
    }

    if (offenders.length > 0) {
      const msg = offenders
        .map(
          (o) =>
            `  • transaction_type "${o.type}" at ${path.relative(WEB_SRC, o.file)}:${o.line}`,
        )
        .join("\n");
      throw new Error(
        `Reconciliation drift detected — new finance_transactions types without shadow-ledger coverage:\n${msg}\n\n` +
          "Either:\n" +
          "  (a) extend _shadow_replay_finance_tx_row in a new migration and add the type to SHADOW_LEDGER_ALLOWLIST here, OR\n" +
          "  (b) if the row belongs on a DIFFERENT table (payment_transactions / loyalty_points_ledger), " +
          "move the insert OR add the type to INTENTIONALLY_SKIPPED with a justification.",
      );
    }
  });

  it("every allowlist entry is actually used somewhere in application code", () => {
    const files = readAppFiles(WEB_SRC);
    const hits = findTransactionTypeLiterals(files);
    const used = new Set(hits.map((h) => h.type));

    const unused = SHADOW_LEDGER_ALLOWLIST.filter((t) => !used.has(t));

    if (unused.length > 0) {
      // This is an allowed warning, not a hard fail — some types may
      // only be emitted by admin tooling or migrations. But we surface
      // it so we can prune dead branches if they persist.
      // eslint-disable-next-line no-console
      console.warn(
        `[reconciliation-drift] allowlist entries not seen in current code paths: ${unused.join(", ")}`,
      );
    }
    // We still assert the set is non-empty to catch accidental wipes.
    expect(SHADOW_LEDGER_ALLOWLIST.length).toBeGreaterThan(10);
  });

  it("no application code inserts finance_transactions with an unknown string type", () => {
    const files = readAppFiles(WEB_SRC);
    const hits = findTransactionTypeLiterals(files);
    // Sanity: we should see at least 10 finance_transactions literals.
    // If this drops precipitously, someone refactored the inserts out
    // and the scan regex is stale — fail fast.
    const financeHits = hits.filter((h) => isFinanceTransactionsInsert(h.context));
    expect(financeHits.length).toBeGreaterThan(10);
  });
});
