/**
 * Static checks for Vercel Workflow conventions (Part N foundation).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const workflowsRoot = join(__dirname, "..");
const repoRoot = join(__dirname, "../../../../..");

const FORBIDDEN_ORCHESTRATOR_IMPORTS = [
  "@/lib/supabase/admin",
  "@/lib/supabase/server",
  "@supabase/supabase-js",
  "@/lib/payments/paystack-server",
  "node:fetch",
] as const;

function collectWorkflowFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "__tests__" && entry.name !== "steps") {
      collectWorkflowFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".workflow.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function collectStepFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectStepFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function importLines(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("import "));
}

function exportedFunctions(source: string): string[] {
  return [...source.matchAll(/^export async function (\w+)/gm)].map((match) => match[1]);
}

describe("workflow directives (static)", () => {
  it("scaffolds step wrappers for Supabase and Paystack", () => {
    expect(existsSync(join(workflowsRoot, "steps/supabase.ts"))).toBe(true);
    expect(existsSync(join(workflowsRoot, "steps/paystack.ts"))).toBe(true);
  });

  it("workflow orchestrators do not import side-effect modules at top level", () => {
    const workflowFiles = collectWorkflowFiles(workflowsRoot);
    expect(workflowFiles.length).toBeGreaterThan(0);

    for (const file of workflowFiles) {
      const rel = relative(repoRoot, file);
      const source = readFileSync(file, "utf8");
      expect(source, `${rel} must include "use workflow"`).toContain('"use workflow"');

      for (const line of importLines(source)) {
        for (const forbidden of FORBIDDEN_ORCHESTRATOR_IMPORTS) {
          expect(
            line.includes(forbidden),
            `${rel} orchestrator must not import ${forbidden} — use steps/ wrappers`,
          ).toBe(false);
        }
      }
    }
  });

  it("exported step functions include the use step directive", () => {
    const stepFiles = collectStepFiles(join(workflowsRoot, "steps")).filter(
      (file) => !file.endsWith("supabase.ts") && !file.endsWith("paystack.ts"),
    );
    expect(stepFiles.length).toBeGreaterThan(0);

    for (const file of stepFiles) {
      const rel = relative(repoRoot, file);
      const source = readFileSync(file, "utf8");
      for (const fn of exportedFunctions(source)) {
        const fnPattern = new RegExp(`export async function ${fn}[\\s\\S]*?"use step"`);
        expect(source, `${rel} export ${fn}() must include "use step"`).toMatch(fnPattern);
      }
    }
  });

  it("non-step workflow modules do not import Supabase admin directly", () => {
    const scanRoots = ["agents", "orchestrators"].map((dir) => join(workflowsRoot, dir));
    for (const dir of scanRoots) {
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
        const source = readFileSync(join(dir, entry.name), "utf8");
        for (const forbidden of FORBIDDEN_ORCHESTRATOR_IMPORTS) {
          expect(source.includes(forbidden), `${entry.name} must not import ${forbidden}`).toBe(false);
        }
      }
    }
  });

  it("next.config.mjs chains withWorkflow when the SDK is present", () => {
    const src = readFileSync(join(repoRoot, "apps/web/next.config.mjs"), "utf8");
    expect(src).toContain("withWorkflow");
    expect(src).toMatch(/require\(['"]workflow\/next['"]\)|from ['"]workflow\/next['"]/);
  });
});
