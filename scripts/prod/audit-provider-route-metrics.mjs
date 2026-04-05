#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const criticalRoutes = [
  {
    label: "Provider dashboard API",
    path: "apps/web/src/app/api/provider/dashboard/route.ts",
    mustInclude: ['withRouteMetrics(', '"/api/provider/dashboard"'],
  },
  {
    label: "Provider bookings API",
    path: "apps/web/src/app/api/provider/bookings/route.ts",
    mustInclude: ['withRouteMetrics(', '"/api/provider/bookings"'],
  },
  {
    label: "Auth role API",
    path: "apps/web/src/app/api/me/role/route.ts",
    mustInclude: ['withRouteMetrics(', '"/api/me/role"'],
  },
];

let hasFailure = false;

console.log("== Provider Route Metrics Coverage Audit ==");

for (const route of criticalRoutes) {
  const absolutePath = resolve(process.cwd(), route.path);
  if (!existsSync(absolutePath)) {
    console.error(`FAIL: Missing file for ${route.label}: ${route.path}`);
    hasFailure = true;
    continue;
  }

  const content = readFileSync(absolutePath, "utf8");
  const missing = route.mustInclude.filter((needle) => !content.includes(needle));
  if (missing.length > 0) {
    console.error(`FAIL: ${route.label} missing route-metrics markers: ${missing.join(", ")}`);
    hasFailure = true;
    continue;
  }

  console.log(`PASS: ${route.label}`);
}

if (hasFailure) {
  console.error("Provider route metrics coverage audit failed.");
  process.exit(1);
}

console.log("Provider route metrics coverage audit passed.");
