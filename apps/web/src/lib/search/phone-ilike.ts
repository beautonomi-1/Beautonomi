import { phoneSearchNeedlesUnscoped } from "@beautonomi/phone";

/** Strip characters that break PostgREST `.or()` / `ilike` patterns. */
export function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[%_,()]/g, "");
}

/** `col.ilike.%needle%` for each column × unscoped phone needle (4+ digits). */
export function phoneIlikeClauses(columns: string[], query: string): string[] {
  const needles = phoneSearchNeedlesUnscoped(query);
  return columns.flatMap((col) => needles.map((n) => `${col}.ilike.%${n}%`));
}
