#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const checks = [
  {
    label: "Direct clipboard usage in provider surfaces",
    args: [
      "navigator\\.clipboard\\.writeText|navigator\\.clipboard\\.write\\(",
      "apps/web/src/app/provider",
      "apps/web/src/components/provider",
      "apps/web/src/components/provider-portal",
    ],
  },
  {
    label: "Potential observer compatibility hotspots",
    args: [
      "new ResizeObserver|new IntersectionObserver",
      "apps/web/src/app/provider",
      "apps/web/src/components/provider",
      "apps/web/src/components/provider-portal",
    ],
  },
];

console.log("== Provider Browser Compatibility Scan ==");
let hasFindings = false;

for (const check of checks) {
  const [pattern, ...paths] = check.args;
  console.log(`\n> ${check.label}`);
  const result = spawnSync("rg", [pattern, ...paths], {
    stdio: "pipe",
    shell: false,
    encoding: "utf8",
  });

  if (result.status === 0) {
    hasFindings = true;
    console.log(result.stdout.trim());
  } else {
    console.log("No matches found.");
  }
}

console.log(
  hasFindings
    ? "\nScan completed with findings. Review each usage and confirm fallback behavior on iPad/older Safari."
    : "\nScan completed with no compatibility hotspots detected in provider paths."
);
