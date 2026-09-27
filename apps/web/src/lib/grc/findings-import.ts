import { createHash } from "node:crypto";

export type ImportedFinding = {
  external_ref: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string | null;
};

export type ImportResult = { rows: ImportedFinding[]; errors: { row: number; message: string }[] };

/** RFC 4180: quoted fields, escaped quotes, CRLF/LF, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) out.push(row);
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const COLUMN_ALIASES: Record<string, string[]> = {
  title: ["title", "name", "finding", "findingtitle", "vulnerability", "issue", "summary"],
  severity: ["severity", "risk", "riskrating", "rating", "cvssseverity", "priority", "level"],
  external_ref: ["id", "ref", "reference", "findingid", "externalref", "externalid", "key", "vulnid"],
  description: ["description", "details", "findingdescription", "observation", "impact"],
  remediation: ["remediation", "recommendation", "fix", "solution"],
  asset: ["asset", "host", "url", "component", "target", "affected"],
};

export function normaliseSeverity(raw: unknown): ImportedFinding["severity"] | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^(crit|critical|p0|sev0|sev ?1)/.test(s)) return "critical";
  if (/^(high|p1|sev ?2|important)/.test(s)) return "high";
  if (/^(med|medium|moderate|p2|sev ?3)/.test(s)) return "medium";
  if (/^(low|minor|p3|sev ?4)/.test(s)) return "low";
  if (/^(info|informational|none|note|p4)/.test(s)) return "info";
  const n = Number(s);
  if (Number.isFinite(n)) return n >= 9 ? "critical" : n >= 7 ? "high" : n >= 4 ? "medium" : n > 0 ? "low" : "info";
  return null;
}

function pick(record: Record<string, unknown>, key: keyof typeof COLUMN_ALIASES): string {
  const aliases = COLUMN_ALIASES[key];
  for (const [k, v] of Object.entries(record)) {
    if (aliases.includes(norm(k)) && v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function toFinding(record: Record<string, unknown>, rowNo: number, errors: ImportResult["errors"]): ImportedFinding | null {
  const title = pick(record, "title");
  if (!title) {
    errors.push({ row: rowNo, message: "No title/name column value" });
    return null;
  }
  const severity = normaliseSeverity(pick(record, "severity"));
  if (!severity) {
    errors.push({ row: rowNo, message: `Unrecognised severity for "${title.slice(0, 60)}"` });
    return null;
  }
  const parts = [pick(record, "description"), pick(record, "asset") && `Affected: ${pick(record, "asset")}`, pick(record, "remediation") && `Remediation: ${pick(record, "remediation")}`].filter(Boolean);
  const ref = pick(record, "external_ref") || `sha:${createHash("sha256").update(`${title}|${pick(record, "asset")}`).digest("hex").slice(0, 16)}`;
  return {
    external_ref: ref.slice(0, 200),
    title: title.slice(0, 300),
    severity,
    description: parts.length ? parts.join("\n\n").slice(0, 20_000) : null,
  };
}

export function parseFindings(format: "csv" | "json", content: string): ImportResult {
  const errors: ImportResult["errors"] = [];
  let records: Record<string, unknown>[];
  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { rows: [], errors: [{ row: 0, message: "Not valid JSON" }] };
    }
    const arr = Array.isArray(parsed) ? parsed : (parsed as { findings?: unknown })?.findings;
    if (!Array.isArray(arr)) return { rows: [], errors: [{ row: 0, message: "Expected an array of findings or { findings: [...] }" }] };
    records = arr.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  } else {
    const table = parseCsv(content);
    if (table.length < 2) return { rows: [], errors: [{ row: 0, message: "CSV needs a header row and at least one finding" }] };
    const [header, ...body] = table;
    records = body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
  }

  const rows: ImportedFinding[] = [];
  const seen = new Set<string>();
  records.forEach((r, i) => {
    const f = toFinding(r, i + 1, errors);
    if (!f) return;
    if (seen.has(f.external_ref)) {
      errors.push({ row: i + 1, message: `Duplicate reference ${f.external_ref} in file` });
      return;
    }
    seen.add(f.external_ref);
    rows.push(f);
  });
  return { rows, errors };
}
