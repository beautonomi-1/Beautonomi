#!/usr/bin/env node
/**
 * Metro workers load Babel plugins from @babel/core's isolated pnpm folder.
 * Search the app package that actually depends on Babel, then resolve the
 * plugin the same way EAS Update's Metro worker does.
 */
const path = require("path");
const fs = require("fs");
const { createRequire } = require("module");

function fail(message) {
  console.error(`[assert-babel-jsx-plugin] ${message}`);
  process.exit(1);
}

const searchRoots = [
  process.cwd(),
  path.join(process.cwd(), "apps", "customer"),
  path.join(process.cwd(), "apps", "provider"),
  path.resolve(__dirname, "..", "..", "apps", "customer"),
  path.resolve(__dirname, "..", "..", "apps", "provider"),
];

let babelCorePath;
let resolvedFrom;
for (const root of searchRoots) {
  const pkg = path.join(root, "package.json");
  if (!fs.existsSync(pkg)) continue;
  try {
    babelCorePath = createRequire(pkg).resolve("@babel/core");
    resolvedFrom = root;
    break;
  } catch {
    // try the next workspace package
  }
}

if (!babelCorePath) {
  fail(
    `@babel/core is not installed (cwd=${process.cwd()}). Add it to customer/provider before EAS Update.`,
  );
}

const fromBabelCore = createRequire(babelCorePath);
let pluginPath;
try {
  pluginPath = fromBabelCore.resolve("@babel/plugin-transform-react-jsx");
} catch (error) {
  fail(
    `@babel/plugin-transform-react-jsx is not resolvable from @babel/core (${babelCorePath}): ${error.message}`,
  );
}

console.log(`[assert-babel-jsx-plugin] cwd -> ${process.cwd()}`);
console.log(`[assert-babel-jsx-plugin] resolved from -> ${resolvedFrom}`);
console.log(`[assert-babel-jsx-plugin] @babel/core -> ${babelCorePath}`);
console.log(`[assert-babel-jsx-plugin] plugin -> ${pluginPath}`);
