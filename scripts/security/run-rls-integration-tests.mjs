#!/usr/bin/env node
/**
 * Cross-tenant / cross-user RLS integration tests against a real Supabase project.
 *
 * Requires:
 *   SUPABASE_TEST_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_TEST_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 *   SUPABASE_TEST_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * Skips gracefully when credentials are absent (CI without secrets).
 *
 * Usage: node scripts/security/run-rls-integration-tests.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_TEST_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "";
const anonKey =
  process.env.SUPABASE_TEST_ANON_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "";
const serviceKey =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  "";

function skip(reason) {
  console.log(`[rls-integration] SKIP: ${reason}`);
  process.exit(0);
}

if (!url || !anonKey || !serviceKey) {
  skip("Supabase test credentials not configured");
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const failures = [];

function assert(name, condition, detail = "") {
  if (!condition) {
    failures.push({ name, detail });
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  } else {
    console.log(`OK   ${name}`);
  }
}

async function main() {
  // 1) Anonymous cannot enumerate gift_cards
  const { data: anonGiftCards, error: anonGcErr } = await anon
    .from("gift_cards")
    .select("id, code, balance")
    .limit(5);
  assert(
    "anon cannot read gift_cards",
    !anonGcErr && (anonGiftCards?.length ?? 0) === 0,
    anonGcErr?.message ?? `rows=${anonGiftCards?.length ?? 0}`,
  );

  // 2) Service role can read (sanity)
  const { data: adminGiftCards, error: adminGcErr } = await admin
    .from("gift_cards")
    .select("id")
    .limit(1);
  assert("service role can read gift_cards", !adminGcErr, adminGcErr?.message);

  // 3) Unauthenticated storage list on message-attachments should fail or be empty
  const { data: storageList, error: storageErr } = await anon.storage
    .from("message-attachments")
    .list("", { limit: 1 });
  assert(
    "anon cannot list message-attachments bucket",
    Boolean(storageErr) || (storageList?.length ?? 0) === 0,
    storageErr?.message ?? `objects=${storageList?.length ?? 0}`,
  );

  // 4) tenant_domains production hosts exist for ZA tenant
  const { data: zaTenant } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", "za")
    .maybeSingle();
  if (zaTenant?.id) {
    const requiredHosts = ["beautonomi.co.za", "www.beautonomi.co.za"];
    for (const host of requiredHosts) {
      const { data: domainRow } = await admin
        .from("tenant_domains")
        .select("tenant_id")
        .eq("hostname", host)
        .eq("environment", "production")
        .eq("is_active", true)
        .maybeSingle();
      assert(
        `tenant_domains maps ${host} → za`,
        domainRow?.tenant_id === zaTenant.id,
        domainRow ? "wrong tenant" : "missing row",
      );
    }
  } else {
    assert("za tenant exists for domain check", false, "tenants.slug=za not found");
  }

  // 5) Anonymous cannot read financial_period_locks
  const { data: anonLocks, error: anonLocksErr } = await anon
    .from("financial_period_locks")
    .select("id")
    .limit(1);
  assert(
    "anon cannot read financial_period_locks",
    Boolean(anonLocksErr) || (anonLocks?.length ?? 0) === 0,
    anonLocksErr?.message ?? `rows=${anonLocks?.length ?? 0}`,
  );

  // 6) Anonymous cannot read agent_actions
  const { data: anonAgentActions, error: anonAgentErr } = await anon
    .from("agent_actions")
    .select("id")
    .limit(1);
  assert(
    "anon cannot read agent_actions",
    Boolean(anonAgentErr) || (anonAgentActions?.length ?? 0) === 0,
    anonAgentErr?.message ?? `rows=${anonAgentActions?.length ?? 0}`,
  );

  // 7) Anonymous cannot read reconciliation_exceptions
  const { data: anonRecon, error: anonReconErr } = await anon
    .from("reconciliation_exceptions")
    .select("id")
    .limit(1);
  assert(
    "anon cannot read reconciliation_exceptions",
    Boolean(anonReconErr) || (anonRecon?.length ?? 0) === 0,
    anonReconErr?.message ?? `rows=${anonRecon?.length ?? 0}`,
  );

  if (failures.length > 0) {
    console.error(`\n[rls-integration] ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\n[rls-integration] All checks passed");
}

main().catch((err) => {
  console.error("[rls-integration] Fatal:", err);
  process.exit(1);
});
