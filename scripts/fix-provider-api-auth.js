const fs = require("fs");
const path = require("path");

function walk(dir, fn) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, fn);
    else if (e.name.endsWith(".ts")) fn(full);
  }
}

let count = 0;
walk("apps/web/src/app/api/provider", (file) => {
  let s = fs.readFileSync(file, "utf8");
  const before = s;
  s = s.replace(/requirePermission\((['"])([^'"]+)\1\)/g, (m, q, name) => {
    if (m.includes(", request")) return m;
    return `requirePermission(${q}${name}${q}, request)`;
  });
  s = s.replace(/getProviderIdForUser\(user\.id\)/g, "getProviderIdForUser(user.id, supabase)");
  if (s !== before) {
    fs.writeFileSync(file, s);
    count++;
  }
});
console.log("Updated", count, "files");
