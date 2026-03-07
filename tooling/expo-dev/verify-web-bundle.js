#!/usr/bin/env node
/**
 * Verify that the customer web dev server returns a valid HTML page and bundle.
 * Run while the customer app is running at http://localhost:8081.
 * Usage: node tooling/expo-dev/verify-web-bundle.js
 */
const http = require("http");

const BASE = process.env.BUNDLE_BASE || "http://localhost:8081";

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 20000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const data = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          data: data.toString("utf8"),
          length: data.length,
          contentType: res.headers["content-type"],
        });
      });
    });
    req.on("error", reject);
  });
}

async function main() {
  console.log("Verifying", BASE, "\n");
  try {
    const page = await get(BASE + "/");
    console.log("GET /");
    console.log("  Status:", page.statusCode);
    console.log("  Content-Type:", page.contentType);
    console.log("  Body length:", page.length, "bytes");
    if (page.statusCode !== 200) {
      console.error("FAIL: Expected 200");
      process.exit(1);
    }
    const scriptMatch = page.data.match(/<script[^>]+src=["']([^"']+)["']/);
    const bundleUrl = scriptMatch ? scriptMatch[1].replace(/^\/+/, "") : null;
    if (!bundleUrl) {
      console.error("FAIL: No script src found in HTML");
      process.exit(1);
    }
    const fullBundleUrl = bundleUrl.startsWith("http") ? bundleUrl : BASE + "/" + bundleUrl;
    console.log("  Bundle URL from HTML:", fullBundleUrl, "\n");

    const bundle = await get(fullBundleUrl);
    console.log("GET bundle");
    console.log("  Status:", bundle.statusCode);
    console.log("  Content-Type:", bundle.contentType);
    console.log("  Body length:", bundle.length, "bytes");
    if (bundle.statusCode !== 200) {
      console.error("FAIL: Bundle returned", bundle.statusCode);
      process.exit(1);
    }
    if (bundle.length < 1000) {
      console.error("FAIL: Bundle too small (likely empty or error page)");
      process.exit(1);
    }
    const looksLikeJs = /^[\s\(\)\[\];!]|var |const |function |\/\*/.test(bundle.data.slice(0, 100));
    console.log("  Looks like JS:", looksLikeJs);
    console.log("\nOK: Page and bundle both returned 200 with content.");
  } catch (err) {
    console.error("FAIL:", err.message || err);
    process.exit(1);
  }
}

main();
