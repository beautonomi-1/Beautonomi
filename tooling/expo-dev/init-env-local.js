#!/usr/bin/env node
/**
 * Creates .env.local from .env.example if it does not exist.
 * Usage: node init-env-local.js [appPath]
 * If appPath omitted, uses process.cwd().
 */
const fs = require("fs");
const path = require("path");

const appPath = path.resolve(process.cwd(), process.argv[2] || ".");
const examplePath = path.join(appPath, ".env.example");
const localPath = path.join(appPath, ".env.local");

if (!fs.existsSync(examplePath)) {
  console.error(`Not found: ${examplePath}`);
  process.exit(1);
}

if (fs.existsSync(localPath)) {
  console.log(".env.local already exists. No action taken.");
  process.exit(0);
}

const content = fs.readFileSync(examplePath, "utf8");
fs.writeFileSync(localPath, content);
console.log("Created .env.local from .env.example. Fill in real values.");
