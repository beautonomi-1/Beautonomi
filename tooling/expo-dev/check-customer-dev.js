#!/usr/bin/env node
/**
 * Smoke check for customer dev server (http://localhost:8081).
 * Run when the customer app is already running (e.g. pnpm run dev:customer).
 * Usage: node tooling/expo-dev/check-customer-dev.js
 */
const http = require("http");

const BASE = "http://localhost:8081";

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function main() {
  console.log("Checking customer dev server at", BASE, "...");
  try {
    const { statusCode: pageStatus, data: html } = await get(BASE + "/");
    if (pageStatus !== 200) {
      console.error("FAIL: GET / returned", pageStatus);
      process.exit(1);
    }
    const match = html.match(/script\s+src=["']([^"']+\.bundle[^"']*)["']/);
    if (!match) {
      console.error("FAIL: No bundle script src in HTML");
      process.exit(1);
    }
    const bundlePath = match[1].replace(/^\/+/, "");
    const bundleUrl = BASE + "/" + bundlePath;
    const { statusCode: bundleStatus } = await get(bundleUrl);
    if (bundleStatus !== 200) {
      console.error("FAIL: GET bundle returned", bundleStatus, bundleUrl);
      process.exit(1);
    }
    console.log("OK: Page 200, bundle 200 at", bundlePath);
  } catch (err) {
    console.error("FAIL:", err.message || err);
    process.exit(1);
  }
}

main();
