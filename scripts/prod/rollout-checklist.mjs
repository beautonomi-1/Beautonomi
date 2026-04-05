#!/usr/bin/env node

console.log("== Progressive Rollout Checklist ==");
console.log("");
console.log("Before advancing a stage:");
console.log("- Confirm current stage window is complete (canary 24h, stage A/B 4h).");
console.log("- Run gate evaluator against latest SLO summary.");
console.log("- Confirm no open P1/P2 incidents.");
console.log("- Confirm release verification report is attached.");
console.log("");
console.log("If any SLO trigger fires:");
console.log("- Freeze rollout.");
console.log("- Roll back one stage.");
console.log("- Open incident and attach request_id/event evidence.");
