/**
 * Codemod: Replace className with style={twStyle(...)} in apps/provider for RN compatibility.
 * Run from repo root: node scripts/provider-classname-to-twstyle.js
 *
 * - Adds import { twStyle } from "@/lib/twStyle"; if missing
 * - Replaces className="..." with style={twStyle("...")}
 * - Replaces className={\`...\`} with style={twStyle(\`...\`)} (including multi-line)
 *
 * Elements that already have both style and className: only className is replaced;
 * you may need to merge manually to style={[twStyle("..."), existingStyle]}.
 */

const fs = require("fs");
const path = require("path");

const PROVIDER_APP = path.join(__dirname, "..", "apps", "provider", "app");
const PROVIDER_SRC = path.join(__dirname, "..", "apps", "provider", "src");
const TWSTYLE_IMPORT = 'import { twStyle } from "@/lib/twStyle";';

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else if (e.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

function addTwStyleImport(content) {
  if (content.includes("twStyle") && content.includes("@/lib/twStyle")) return content;
  // Find last import line and insert after it
  const lines = content.split("\n");
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("import ") && (trimmed.endsWith(";") || trimmed.includes(";"))) {
      lastImportIndex = i;
    }
  }
  if (lastImportIndex === -1) return content;
  const insertLine = lastImportIndex + 1;
  const before = lines.slice(0, insertLine);
  const after = lines.slice(insertLine);
  return [...before, TWSTYLE_IMPORT, ...after].join("\n");
}

function transform(content) {
  let s = content;
  if (!s.includes("className=")) return s;

  s = addTwStyleImport(s);

  // Static: className="..."
  s = s.replace(/className="([^"]*)"/g, (_, cls) => `style={twStyle("${cls.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")}`);

  // Template literal: className={\`...\`} (content may include ${...}, ends at `})
  s = s.replace(/className=\{\`((?:[^`]|\`(?=\}))*)\`\}/g, (_, cls) => `style={twStyle(\`${cls}\`)}`);

  // Expression: className={expr} (e.g. cond ? "a" : "b") — only when expr has no unquoted "}"
  s = s.replace(/className=\{([^}]+)\}/g, (_, expr) => `style={twStyle(${expr.trim()})}`);

  return s;
}

function main() {
  const files = [...walk(PROVIDER_APP), ...walk(PROVIDER_SRC)];
  let changed = 0;
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const next = transform(content);
    if (next !== content) {
      fs.writeFileSync(file, next);
      changed++;
      console.log(path.relative(path.join(__dirname, ".."), file));
    }
  }
  console.log("\nDone. Updated", changed, "files.");
}

main();
