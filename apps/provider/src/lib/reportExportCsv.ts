/**
 * Build CSV from arbitrary report JSON for mobile share (Excel / Google Sheets).
 */
import * as FileSystem from "expo-file-system/legacy";
import { Platform, Share } from "react-native";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    return JSON.stringify(value).replace(/"/g, '""');
  }
  return String(value).replace(/"/g, '""');
}

function toCsvRow(cells: string[]): string {
  return cells.map((c) => `"${c}"`).join(",");
}

/** Unwrap typical `{ data: T }` API responses. */
export function unwrapReportPayload(input: unknown): unknown {
  if (input && typeof input === "object" && "data" in input && !Array.isArray(input)) {
    return (input as { data: unknown }).data;
  }
  return input;
}

function rowsFromFirstObjectArray(
  obj: Record<string, unknown>
): { headers: string[]; rows: string[][] } | null {
  for (const v of Object.values(obj)) {
    if (
      Array.isArray(v) &&
      v.length > 0 &&
      typeof v[0] === "object" &&
      v[0] !== null &&
      !Array.isArray(v[0])
    ) {
      const arr = v as Record<string, unknown>[];
      const keys = new Set<string>();
      for (const row of arr) {
        for (const k of Object.keys(row)) {
          keys.add(k);
        }
      }
      const headers = Array.from(keys);
      const rows = arr.map((row) => headers.map((h) => escapeCell(row[h])));
      return { headers, rows };
    }
  }
  return null;
}

/**
 * Flattens nested report payloads to a CSV string.
 */
export function reportPayloadToCsvString(payload: unknown, _reportId: string): string {
  const p = unwrapReportPayload(payload);
  if (p == null) {
    return toCsvRow(["(empty)"]);
  }

  if (Array.isArray(p)) {
    if (p.length === 0) {
      return toCsvRow(["(empty)"]);
    }
    const first = p[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const keys = new Set<string>();
      for (const row of p) {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          for (const k of Object.keys(row as object)) {
            keys.add(k);
          }
        }
      }
      const headers = Array.from(keys);
      const lines = p.map((row) => {
        const r = (row as Record<string, unknown>) || {};
        return toCsvRow(headers.map((h) => escapeCell(r[h])));
      });
      return [toCsvRow(headers), ...lines].join("\n");
    }
    return [toCsvRow(["value"]), ...p.map((v) => toCsvRow([escapeCell(v)]))].join("\n");
  }

  if (typeof p === "object" && p !== null) {
    const obj = p as Record<string, unknown>;
    const tab = rowsFromFirstObjectArray(obj);
    if (tab) {
      return [toCsvRow(tab.headers), ...tab.rows.map((r) => toCsvRow(r))].join("\n");
    }
    return [
      toCsvRow(["key", "value"]),
      ...Object.entries(obj).map(([k, v]) => toCsvRow([k, escapeCell(v)])),
    ].join("\n");
  }

  return toCsvRow([String(p)]);
}

/**
 * Write CSV to cache and open the native share sheet (file on iOS / Android where supported).
 */
export async function shareReportAsCsv(
  reportId: string,
  displayTitle: string,
  payload: unknown
): Promise<void> {
  const csv = reportPayloadToCsvString(payload, reportId);
  const safe = reportId.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
  const name = `beautonomi_report_${safe}_${new Date().toISOString().slice(0, 10)}.csv`;
  const base = FileSystem.cacheDirectory;
  if (!base && Platform.OS !== "web") {
    await Share.share({ title: displayTitle, message: `${displayTitle}\n\n${csv.slice(0, 12_000)}` });
    return;
  }
  const uri = `${base ?? ""}${name}`;

  await FileSystem.writeAsStringAsync(uri, "\uFEFF" + csv);

  if (Platform.OS === "web") {
    await Share.share({
      title: displayTitle,
      message: csv.length > 12_000 ? `${displayTitle} — use the mobile app to share a .csv file.` : `${displayTitle}\n\n${csv}`,
    });
    return;
  }

  await Share.share({
    title: displayTitle,
    url: uri,
    message: `${displayTitle} (CSV)`,
  });
}
