#!/usr/bin/env node
/**
 * Copy public storage objects from production → staging for preview UX.
 * Only public buckets; skips if object already exists on staging.
 */
import { createClient } from "@supabase/supabase-js";
import { PROJECTS, serviceRoleKey } from "./supabase-env.mjs";

const PUBLIC_BUCKETS = [
  "learning-center",
  "CMS-IMAGES",
  "avatars",
  "provider-gallery",
  "service-images",
  "explore-posts",
  "product-images",
  "custom-request-attachments",
];

const MAX_OBJECTS_PER_BUCKET = 200;
const MAX_BYTES = 15 * 1024 * 1024;

async function listAllObjects(admin, bucket, prefix = "") {
  const out = [];
  let offset = 0;
  const limit = 100;
  while (out.length < MAX_OBJECTS_PER_BUCKET) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id == null && entry.metadata == null) {
        const nested = await listAllObjects(admin, bucket, path);
        out.push(...nested);
      } else {
        out.push(path);
      }
      if (out.length >= MAX_OBJECTS_PER_BUCKET) break;
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function main() {
  const prodKey = serviceRoleKey(PROJECTS.production.ref);
  const stageKey = serviceRoleKey(PROJECTS.staging.ref);
  const prod = createClient(PROJECTS.production.url, prodKey, {
    auth: { persistSession: false },
  });
  const stage = createClient(PROJECTS.staging.url, stageKey, {
    auth: { persistSession: false },
  });

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const bucket of PUBLIC_BUCKETS) {
    let paths = [];
    try {
      paths = await listAllObjects(prod, bucket);
    } catch (e) {
      console.warn(`[${bucket}] list prod: ${e.message}`);
      continue;
    }
    console.log(`[${bucket}] ${paths.length} object(s) to consider`);
    for (const path of paths) {
      const { error: headErr } = await stage.storage.from(bucket).download(path);
      if (!headErr) {
        skipped++;
        continue;
      }
      const { data: blob, error: dlErr } = await prod.storage.from(bucket).download(path);
      if (dlErr || !blob) {
        console.warn(`  skip ${path}: download ${dlErr?.message}`);
        failed++;
        continue;
      }
      if (blob.size > MAX_BYTES) {
        console.warn(`  skip ${path}: too large (${blob.size})`);
        skipped++;
        continue;
      }
      const buf = Buffer.from(await blob.arrayBuffer());
      const { error: upErr } = await stage.storage.from(bucket).upload(path, buf, {
        upsert: true,
        contentType: blob.type || undefined,
      });
      if (upErr) {
        console.warn(`  fail ${path}: ${upErr.message}`);
        failed++;
      } else {
        copied++;
      }
    }
  }

  console.log(`\nDone: copied=${copied} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
