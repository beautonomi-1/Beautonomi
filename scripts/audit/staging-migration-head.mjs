#!/usr/bin/env node
/**
 * Read applied migration versions on staging. Does not print the access token.
 */
const projectRef = process.argv[2] || "byfzhyqvtbasxptxdupf";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set");
  process.exit(2);
}

const query = `
select version, name
  from supabase_migrations.schema_migrations
 where version like '1018%'
    or version like '1019%'
 order by version
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({ query }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`query failed (${res.status}): ${text.slice(0, 1500)}`);
  process.exit(1);
}
const rows = JSON.parse(text);
const list = Array.isArray(rows) ? rows : rows.rows || [];
for (const row of list) {
  console.log(`${row.version}\t${row.name ?? ""}`);
}
console.log(`count=${list.length}`);
