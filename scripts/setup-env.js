#!/usr/bin/env node

/**
 * Beautonomi Environment Setup Script
 *
 * Creates .env.local files from .env.example templates for all apps.
 * Run from repo root: node scripts/setup-env.js
 */

const fs = require("fs");
const path = require("path");

const APPS = [
  { dir: "apps/web", name: "Web App" },
  { dir: "apps/customer", name: "Customer Mobile App" },
  { dir: "apps/provider", name: "Provider Mobile App" },
];

let created = 0;
let skipped = 0;

for (const app of APPS) {
  const examplePath = path.join(__dirname, "..", app.dir, ".env.example");
  const localPath = path.join(__dirname, "..", app.dir, ".env.local");

  if (!fs.existsSync(examplePath)) {
    console.log(`  [SKIP] ${app.name}: no .env.example found`);
    skipped++;
    continue;
  }

  if (fs.existsSync(localPath)) {
    console.log(`  [EXISTS] ${app.name}: .env.local already exists`);
    skipped++;
    continue;
  }

  fs.copyFileSync(examplePath, localPath);
  console.log(`  [CREATED] ${app.name}: .env.local created from .env.example`);
  created++;
}

console.log(`\nDone: ${created} created, ${skipped} skipped.`);

if (created > 0) {
  console.log("\nNext steps:");
  console.log("  1. Open each .env.local file and fill in your values");
  console.log("  2. Get Supabase keys from: https://supabase.com/dashboard");
  console.log("  3. Get Paystack keys from: https://dashboard.paystack.com");
  console.log("  4. Run: pnpm dev");
}
