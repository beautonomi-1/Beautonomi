import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../src/app/provider/reports");

const importLine =
  'import { useReportExportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";\n';

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "page.tsx") out.push(p);
  }
}

const files = [];
walk(root, files);

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  if (!s.includes("formatReportDataForExport")) continue;

  if (!s.includes("useReportExportCurrency")) {
    const lineEnd = s.indexOf("\n");
    if (lineEnd === -1) continue;
    s = s.slice(0, lineEnd + 1) + importLine + s.slice(lineEnd + 1);
  }

  if (!s.includes("useReportExportCurrency()")) {
    const m = s.match(/export default function \w+\([^)]*\) \{/);
    if (!m) {
      console.warn("skip no default fn", f);
      continue;
    }
    const insertAt = m.index + m[0].length;
    s =
      s.slice(0, insertAt) +
      "\n  const exportCurrency = useReportExportCurrency();" +
      s.slice(insertAt);
  }

  s = s.replace(
    /formatReportDataForExport\((data as unknown as ReportRow), "([^"]+)"\)/g,
    "formatReportDataForExport($1, \"$2\", exportCurrency)",
  );

  fs.writeFileSync(f, s);
  console.log("ok", path.relative(process.cwd(), f));
}
