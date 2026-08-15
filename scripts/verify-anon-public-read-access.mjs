#!/usr/bin/env node
/**
 * Read-only diagnostic: can the anon role still read the public surface?
 *
 * Catches the 842 regression class where a bulk
 * `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` strips EXECUTE
 * on a SECURITY DEFINER helper that RLS policies call (e.g. is_superadmin).
 * Because permissive policies are OR-ed and all evaluated, losing that grant
 * makes every anonymous SELECT fail with 42501 "permission denied for
 * function ...", which app code often swallows into an empty list.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   node scripts/verify-anon-public-read-access.mjs
 *
 * Exits non-zero if any probed table is unreadable by anon.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY (or the NEXT_PUBLIC_* equivalents)");
  process.exit(1);
}

/** Tables the logged-out web/mobile surface reads directly under RLS. */
const PUBLIC_TABLES = [
  "global_service_categories",
  "subcategories",
  "provider_global_category_associations",
  "provider_categories",
  "providers",
  "offerings",
  "master_services",
  "explore_posts",
  "provider_locations",
  "platform_zones",
  "tenant_domains",
  "page_content",
  "learning_articles",
];

const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const blocked = [];
const readable = [];

for (const table of PUBLIC_TABLES) {
  const { error } = await anon.from(table).select("*").limit(1);
  if (error) {
    blocked.push({
      table,
      code: error.code || "UNKNOWN",
      message: error.message || JSON.stringify(error),
    });
  } else {
    readable.push(table);
  }
}

console.log(`anon-readable: ${readable.length}/${PUBLIC_TABLES.length}`);

if (blocked.length === 0) {
  console.log("OK — anon can read the whole probed public surface.");
  process.exit(0);
}

console.error("\nBlocked for anon:");
for (const row of blocked) {
  console.error(`  [${row.code}] ${row.table}: ${row.message}`);
}

const missingExecute = blocked.filter((row) => /permission denied for function/.test(row.message));
if (missingExecute.length > 0) {
  const fnNames = [
    ...new Set(
      missingExecute
        .map((row) => row.message.match(/permission denied for function (\w+)/)?.[1])
        .filter(Boolean),
    ),
  ];
  console.error(
    `\nanon is missing EXECUTE on RLS helper function(s): ${fnNames.join(", ")}.` +
      "\nGrant them back to anon (see supabase/migrations/844_restore_anon_rls_helper_execute.sql).",
  );
}

process.exit(1);
