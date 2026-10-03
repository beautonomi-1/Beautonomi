import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ALLOWLIST_PATH = path.join(here, "audit-allowlist.json");

/** @typedef {{ package: string; reason: string; paths?: string[]; expires: string }} AllowlistEntry */

/**
 * @returns {AllowlistEntry[]}
 */
export function loadAllowlist(filePath = ALLOWLIST_PATH) {
  const raw = fs.readFileSync(filePath, "utf8");
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    throw new Error("audit-allowlist.json must be a JSON array");
  }
  return entries;
}

/**
 * @param {AllowlistEntry[]} entries
 * @param {Date} [now]
 */
export function findExpiredAllowlistEntries(entries, now = new Date()) {
  const expired = [];
  for (const entry of entries) {
    if (!entry.package || !entry.expires) {
      throw new Error(`Invalid allowlist entry (need package + expires): ${JSON.stringify(entry)}`);
    }
    const exp = new Date(entry.expires);
    if (Number.isNaN(exp.getTime())) {
      throw new Error(`Invalid expires date for ${entry.package}: ${entry.expires}`);
    }
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const expDay = new Date(exp);
    expDay.setHours(0, 0, 0, 0);
    if (expDay < today) {
      expired.push(entry);
    }
  }
  return expired;
}

/**
 * @param {AllowlistEntry[]} entries
 * @param {string} packageName
 */
export function isPackageAllowlisted(entries, packageName) {
  return entries.some((e) => e.package === packageName);
}
