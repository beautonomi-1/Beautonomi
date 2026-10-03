#!/usr/bin/env node
/**
 * Sync Paystack keys into ZA region_secrets + region_settings (and optional platform_secrets).
 *
 * Reads keys from environment (never commit secrets):
 *   PAYSTACK_SECRET_KEY
 *   PAYSTACK_PUBLIC_KEY or NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
 *
 * Usage:
 *   node tooling/audit/sync-paystack-region-keys.mjs production
 *   node tooling/audit/sync-paystack-region-keys.mjs staging
 *   node tooling/audit/sync-paystack-region-keys.mjs production --clear-region
 *
 * Load env from a local file (gitignored):
 *   set DOTENV_PATH=apps/web/.env.paystack.sync.local
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PROJECTS, serviceRoleKey } from "./supabase-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function loadDotenv() {
  const dotenvPath =
    process.env.DOTENV_PATH ||
    path.join(root, "apps/web/.env.paystack.sync.local");
  if (!fs.existsSync(dotenvPath)) return;
  for (const line of fs.readFileSync(dotenvPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

function keyMode(prefix) {
  if (!prefix) return "?";
  if (prefix.startsWith("sk_live") || prefix.startsWith("pk_live")) return "live";
  if (prefix.startsWith("sk_test") || prefix.startsWith("pk_test")) return "test";
  return "unknown";
}

async function syncZaRegion(supabase, { secret, publicKey, clearRegion }) {
  const { data: regionRow } = await supabase
    .from("regions")
    .select("id")
    .eq("code", "ZA")
    .eq("is_active", true)
    .maybeSingle();
  const regionId = regionRow?.id;
  if (!regionId) throw new Error("ZA region row not found");

  if (clearRegion) {
    await supabase
      .from("region_secrets")
      .delete()
      .eq("region_id", regionId)
      .eq("key", "paystack_secret_key");
    const { data: settingsRow } = await supabase
      .from("region_settings")
      .select("id, settings")
      .eq("region_id", regionId)
      .maybeSingle();
    if (settingsRow?.id) {
      const settings = { ...(settingsRow.settings ?? {}) };
      delete settings.paystack_public_key;
      await supabase
        .from("region_settings")
        .update({ settings, updated_at: new Date().toISOString() })
        .eq("id", settingsRow.id);
    }
    return ["region_cleared"];
  }

  const updated = [];
  if (secret) {
    await supabase.from("region_secrets").upsert(
      {
        region_id: regionId,
        key: "paystack_secret_key",
        value_encrypted: secret,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "region_id,key" },
    );
    updated.push("region_secrets");
  }
  if (publicKey) {
    const { data: settingsRow } = await supabase
      .from("region_settings")
      .select("id, settings")
      .eq("region_id", regionId)
      .maybeSingle();
    const settings = {
      ...(settingsRow?.settings ?? {}),
      paystack_public_key: publicKey,
    };
    if (settingsRow?.id) {
      await supabase
        .from("region_settings")
        .update({ settings, updated_at: new Date().toISOString() })
        .eq("id", settingsRow.id);
    } else {
      await supabase.from("region_settings").insert({
        region_id: regionId,
        settings,
        is_active: true,
      });
    }
    updated.push("region_settings");
  }

  if (secret || publicKey) {
    const payload = {
      tenant_id: null,
      updated_at: new Date().toISOString(),
      ...(secret ? { paystack_secret_key: secret } : {}),
      ...(publicKey ? { paystack_public_key: publicKey } : {}),
    };
    const { data: existing } = await supabase
      .from("platform_secrets")
      .select("id")
      .is("tenant_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      await supabase.from("platform_secrets").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("platform_secrets").insert(payload);
    }
    updated.push("platform_secrets");
  }

  return updated;
}

async function main() {
  loadDotenv();
  const target = process.argv[2];
  const clearRegion = process.argv.includes("--clear-region");
  if (target !== "production" && target !== "staging") {
    console.error("Usage: node sync-paystack-region-keys.mjs production|staging [--clear-region]");
    process.exit(1);
  }

  const cfg = PROJECTS[target];
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
  const publicKey =
    process.env.PAYSTACK_PUBLIC_KEY?.trim() ||
    process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() ||
    "";

  if (!clearRegion && !secret && !publicKey) {
    console.error(
      "No keys in env. Set PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY (or NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY), " +
        "or use DOTENV_PATH=apps/web/.env.paystack.sync.local",
    );
    process.exit(1);
  }

  if (target === "production" && secret && !secret.startsWith("sk_live_")) {
    console.error("Refusing: production sync requires sk_live_ secret.");
    process.exit(1);
  }
  if (target === "staging" && secret && !secret.startsWith("sk_test_")) {
    console.warn("Warning: staging usually uses sk_test_ secret.");
  }

  const supabase = createClient(cfg.url, serviceRoleKey(cfg.ref), {
    auth: { persistSession: false },
  });

  const updated = await syncZaRegion(supabase, {
    secret: secret || null,
    publicKey: publicKey || null,
    clearRegion,
  });

  console.log(
    JSON.stringify(
      {
        target,
        ref: cfg.ref,
        mode: clearRegion ? "clear-region" : keyMode(secret),
        publicMode: keyMode(publicKey),
        updated,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
