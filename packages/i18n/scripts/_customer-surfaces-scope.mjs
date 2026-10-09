/**
 * In-scope i18n keys for customer mobile app + customer website (no provider portal).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isIdentity, stillMostlyEnglish } from "./_wave-a-translate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = path.join(__dirname, "..");
export const REPO_ROOT = path.join(PKG_ROOT, "../..");
export const LOCALES_DIR = path.join(PKG_ROOT, "src/locales");

export const TARGET_LOCALES = [
  "af",
  "zu",
  "xh",
  "st",
  "nso",
  "tn",
  "ts",
  "ve",
  "ss",
  "fr",
  "ar",
  "sw",
  "pt",
  "es",
  "de",
  "hi",
  "id",
  "tr",
  "am",
  "rw",
  "nl",
  "it",
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".expo",
  "dist",
  "android",
  "ios",
  ".next",
  ".turbo",
  "test-results",
  "__tests__",
]);

const PROVIDER_MOBILE_DEFAULT_PREFIXES = new Set([
  "provider.mobile.screens.blockedUsers",
  "provider.mobile.screens.emergencyContact",
  "provider.mobile.screens.reportUser",
]);

const AUTH_TEMPLATE_SUFFIXES = new Set([
  "auth.passwordWeak",
  "auth.passwordFair",
  "auth.passwordGood",
  "auth.passwordStrong",
]);

const litRe = /\bt\(\s*["'`]([a-zA-Z][\w.\-]+)["'`]/g;
const i18nLitRe = /\bi18n\.t\(\s*["'`]([a-zA-Z][\w.\-]+)["'`]/g;
const dynRe = /(?:i18n\.)?t\(\s*`([a-zA-Z][\w.]*)\.\$\{/g;
const varPrefixAssignRe = /\b(?:const|let)\s+(\w+)\s*=\s*["'`]([a-zA-Z][\w.]+)["'`]/g;
const varDynKeyRe = /(?:i18n\.)?t\(\s*`\$\{(\w+)\}\.([a-zA-Z][\w]+)`/g;
const varDynMonthRe = /(?:i18n\.)?t\(\s*`\$\{(\w+)\}\.month\$\{/g;

export function flattenLocale(obj, prefix = "", out = new Map()) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenLocale(v, full, out);
    else if (typeof v === "string") out.set(full, v);
  }
  return out;
}

function isProviderWebPath(rel) {
  return (
    rel.includes("/provider/") ||
    rel.includes("/provider-portal/") ||
    rel.includes("/components/calendar/") ||
    rel.startsWith("apps/web/src/app/admin/") ||
    rel.startsWith("apps/web/src/app/api/admin/") ||
    rel.startsWith("apps/admin-web/")
  );
}

function walkCode(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) walkCode(fp, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(ent.name) && !/\.(test|spec)\./.test(ent.name)) out.push(fp);
  }
  return out;
}

function resolveKey(key, enFlat) {
  if (!key || !key.includes(".")) return null;
  if (key.startsWith("web.provider.") || key.startsWith("provider.")) return null;
  if (enFlat.has(key)) return key;
  if (enFlat.has(`${key}_other`)) return `${key}_other`;
  if (enFlat.has(`${key}_one`)) return `${key}_one`;
  return null;
}

function keysFromSource(src, enFlat) {
  const keys = new Set();
  const prefixes = new Set();
  for (const re of [litRe, i18nLitRe]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const r = resolveKey(m[1], enFlat);
      if (r) keys.add(r);
    }
  }
  dynRe.lastIndex = 0;
  let m;
  while ((m = dynRe.exec(src))) prefixes.add(m[1]);

  /** `const piPrefix = "web.foo"; t(\`${piPrefix}.bar\`)` */
  const prefixVars = new Map();
  varPrefixAssignRe.lastIndex = 0;
  while ((m = varPrefixAssignRe.exec(src))) {
    const dotted = m[2];
    if (dotted.startsWith("web.provider.") || dotted.startsWith("provider.")) continue;
    prefixVars.set(m[1], dotted);
  }
  varDynKeyRe.lastIndex = 0;
  while ((m = varDynKeyRe.exec(src))) {
    const base = prefixVars.get(m[1]);
    if (!base) continue;
    const r = resolveKey(`${base}.${m[2]}`, enFlat);
    if (r) keys.add(r);
  }
  varDynMonthRe.lastIndex = 0;
  while ((m = varDynMonthRe.exec(src))) {
    const base = prefixVars.get(m[1]);
    if (!base) continue;
    for (let i = 1; i <= 12; i++) {
      const r = resolveKey(`${base}.month${i}`, enFlat);
      if (r) keys.add(r);
    }
  }

  return { keys, prefixes };
}

function expandPrefix(prefix, enFlat, into) {
  if (PROVIDER_MOBILE_DEFAULT_PREFIXES.has(prefix)) return;
  if (prefix === "auth") {
    for (const k of AUTH_TEMPLATE_SUFFIXES) into.add(k);
    return;
  }
  const dot = prefix.endsWith(".") ? prefix : `${prefix}.`;
  for (const k of enFlat.keys()) {
    if (k === prefix || k.startsWith(dot)) into.add(k);
  }
}

/**
 * @param {string} [repoRoot]
 * @returns {Set<string>}
 */
export function collectInScopeKeys(repoRoot = REPO_ROOT) {
  const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
  const scope = new Set();

  for (const fp of walkCode(path.join(repoRoot, "apps/customer"))) {
    const { keys, prefixes } = keysFromSource(fs.readFileSync(fp, "utf8"), enFlat);
    for (const k of keys) scope.add(k);
    for (const p of prefixes) expandPrefix(p, enFlat, scope);
  }

  for (const fp of walkCode(path.join(repoRoot, "apps/web/src"))) {
    const rel = path.relative(repoRoot, fp).replace(/\\/g, "/");
    if (isProviderWebPath(rel)) continue;
    const { keys, prefixes } = keysFromSource(fs.readFileSync(fp, "utf8"), enFlat);
    for (const k of keys) scope.add(k);
    for (const p of prefixes) expandPrefix(p, enFlat, scope);
  }

  return scope;
}

/** @returns {boolean} true when translation is still considered English / unfinished */
export function isCustomerSurfaceLeftover(enVal, locVal) {
  if (typeof enVal !== "string") return false;
  if (locVal == null || locVal === "") return true;
  if (typeof locVal !== "string") return true;
  if (isIdentity(enVal)) return false;
  if (locVal === enVal) {
    if (enVal.length < 8 && !/\s/.test(enVal)) return false;
    return true;
  }
  if (enVal.length >= 40 && stillMostlyEnglish(enVal, locVal)) return true;
  return false;
}

export function auditCustomerSurfaces(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const keys = collectInScopeKeys(repoRoot);
  const enFlat = flattenLocale(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8")));
  const perLocale = {};
  let totalLeftover = 0;

  for (const locale of TARGET_LOCALES) {
    const locFlat = flattenLocale(
      JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8")),
    );
    let leftover = 0;
    let missing = 0;
    for (const key of keys) {
      const enVal = enFlat.get(key);
      if (typeof enVal !== "string") continue;
      const locVal = locFlat.get(key);
      if (locVal == null) missing += 1;
      if (isCustomerSurfaceLeftover(enVal, locVal)) leftover += 1;
    }
    perLocale[locale] = { leftover, missing, scope: keys.size };
    totalLeftover += leftover;
  }

  return { scopeSize: keys.size, perLocale, totalLeftover, keys };
}
