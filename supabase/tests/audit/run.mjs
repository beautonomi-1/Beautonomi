#!/usr/bin/env node
/**
 * Runs the money-invariant SQL tests in supabase/tests/audit/*.test.sql
 * against a Postgres database that already has the migrations applied.
 *
 * Usage:
 *   node supabase/tests/audit/run.mjs                 # uses $DATABASE_URL
 *   DATABASE_URL=postgres://... node supabase/tests/audit/run.mjs
 *   node supabase/tests/audit/run.mjs --docker beautonomi-audit-db   # psql inside a container
 *
 * Each *.test.sql file wraps itself in BEGIN … ROLLBACK and raises on the first
 * failed assertion, so a non-zero psql exit code means a failed invariant.
 * The DB must be a local/CI instance with superuser or service-role access
 * (the tests impersonate roles with SET ROLE); never point this at production.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dockerIdx = args.indexOf("--docker");
const container = dockerIdx >= 0 ? args[dockerIdx + 1] : null;
const dbUrl = process.env.DATABASE_URL;

if (!container && !dbUrl) {
  console.error("DATABASE_URL is not set and --docker <container> was not given.");
  process.exit(2);
}
if (dbUrl && /supabase\.co/.test(dbUrl) && !process.env.AUDIT_TESTS_ALLOW_REMOTE) {
  console.error("Refusing to run audit tests against a hosted Supabase URL (set AUDIT_TESTS_ALLOW_REMOTE=1 for staging).");
  process.exit(2);
}

const files = readdirSync(here).filter((f) => f.endsWith(".test.sql")).sort();
let failed = 0;

for (const file of files) {
  const started = Date.now();
  let result;
  if (container) {
    // Copy the directory in and run from inside the container (psql may not be installed on the host).
    spawnSync("docker", ["exec", container, "rm", "-rf", "/tmp/audit-tests"], { stdio: "ignore" });
    spawnSync("docker", ["cp", here, `${container}:/tmp/audit-tests`], { stdio: "inherit" });
    result = spawnSync(
      "docker",
      ["exec", "-w", "/tmp/audit-tests", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", file],
      { encoding: "utf8" },
    );
  } else {
    result = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(here, file)], {
      encoding: "utf8",
      cwd: here,
    });
  }
  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const passes = (out.match(/NOTICE:\s+PASS:/g) ?? []).length;
  const ms = Date.now() - started;
  if (result.status === 0) {
    console.log(`PASS  ${file}  (${passes} assertions, ${ms} ms)`);
  } else {
    failed += 1;
    console.log(`FAIL  ${file}  (${passes} assertions passed before failure, ${ms} ms)`);
    const lines = out.split("\n").filter((l) => /ERROR|FAIL:|DETAIL|HINT|CONTEXT/.test(l));
    console.log(lines.map((l) => "      " + l).join("\n"));
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} audit test files failed.`);
  process.exit(1);
}
console.log(`\nAll ${files.length} audit test files passed.`);
