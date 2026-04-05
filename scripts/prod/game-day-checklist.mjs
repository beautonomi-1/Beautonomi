#!/usr/bin/env node

console.log("== Game Day Checklist ==");
console.log("");
console.log("Scenarios:");
console.log("1) Payment provider degradation");
console.log("2) Database latency spike");
console.log("3) Cron/background backlog");
console.log("4) Notification outage");
console.log("");
console.log("Before each drill:");
console.log("- Confirm on-call and rollback owner assigned.");
console.log("- Confirm alert channels are active.");
console.log("- Confirm staging data is safe for fault injection.");
console.log("");
console.log("After each drill:");
console.log("- Save a report using docs/incidents/game-days/TEMPLATE.md");
console.log("- Create action items with owner and due date.");
console.log("- Re-run impacted smoke/load checks.");
