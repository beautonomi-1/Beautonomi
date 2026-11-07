#!/usr/bin/env node
/**
 * Learning Center content lint.
 *
 * Database mode (default) reads the seeded content with the service role and checks:
 *   - /learn/article/<slug> links point to published public articles
 *   - /admin/knowledge-base/<slug> links point to published articles
 *   - training path steps and homepage featured / platform_guides / platform_updates are published
 *   - checkpoint quizzes have 2-6 choices and an in-range answer_index
 *   - data-learn-mockup ids exist in packages/learning-mockups/src/catalog.ts
 *   - /admin/... paths in internal articles exist in admin-web nav.ts or App.tsx routes
 *   - every admin nav.ts href is mentioned by at least one internal article
 *   - banned stale phrases are absent; every published article has a summary
 *   - short public bodies are reported as warnings
 *
 * Static mode (--static [files...]) checks migration SQL without a database: banned phrases,
 * mockup ids, admin paths, and /learn/article links against slugs declared in learning migrations.
 * Defaults to the learning migrations numbered 10126 and above.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-learning-content.mjs
 *   node scripts/verify-learning-content.mjs --static
 *
 * Exits non-zero when any error is found.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

const BANNED_PHRASES = [
  "More → Yoco payments",
  "More -> Yoco payments",
  "Team/Client list",
  "back to your card",
  "original payment method",
  "Calendar tab",
  "sumsub",
  "coming soon",
  "lorem ipsum",
  "TODO",
];

/** Nav hrefs that intentionally have no runbook mention. */
const NAV_COVERAGE_EXCLUSIONS = new Set([
  "/admin/settings/integrations/analytics",
]);

const MIN_PUBLIC_TEXT_LENGTH = 400;

const errors = [];
const warnings = [];
const error = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function loadMockupIds() {
  const src = read("packages/learning-mockups/src/catalog.ts");
  return new Set([...src.matchAll(/\bid:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]));
}

function loadNavHrefs() {
  const src = read("apps/admin-web/src/config/nav.ts");
  return [...new Set([...src.matchAll(/\bhref:\s*"([^"]+)"/g)].map((m) => m[1]))]
    .filter((h) => h.startsWith("/admin"))
    .map((h) => h.replace(/\/+$/, ""));
}

function loadRoutePatterns() {
  const src = read("apps/admin-web/src/App.tsx");
  // Routes nest one per line: a `<Route path="x" ...>` line not ending in "/>" opens a parent.
  const stack = [];
  const paths = [];
  for (const line of src.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("</Route>")) {
      stack.pop();
      continue;
    }
    const m = trimmed.match(/^<Route\s+(?:path="([^"]*)")?/);
    if (!m) continue;
    const full = [...stack, m[1] ?? ""].filter(Boolean).join("/");
    if (m[1]) paths.push(full);
    if (!trimmed.endsWith("/>")) stack.push(m[1] ?? "");
  }
  return paths
    .filter((p) => !p.endsWith("*"))
    .map((p) => {
      const escaped = p
        .replace(/\/+$/, "")
        .split("/")
        .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/");
      return new RegExp(`^/admin/${escaped}$`);
    });
}

function stripHtml(html) {
  return (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLearnLinks(text) {
  return [...(text ?? "").matchAll(/\/learn\/article\/([a-z0-9-]+)/g)].map((m) => m[1]);
}

function extractKbLinks(text) {
  return [...(text ?? "").matchAll(/\/admin\/knowledge-base\/([a-z0-9-]+)/g)].map((m) => m[1]);
}

function extractMockups(text) {
  return [...(text ?? "").matchAll(/data-learn-mockup="([^"]+)"/g)].map((m) => m[1]);
}

function extractAdminPaths(text) {
  return [...(text ?? "").matchAll(/\/admin(?:\/[a-zA-Z0-9_:\-\[\]]+)*/g)]
    .map((m) => m[0].replace(/\/+$/, ""))
    .filter((p) => p !== "/admin");
}

const SQL_LITERAL = /^(?:'(?:[^']|'')*'|\$([a-z]*)\$[\s\S]*?\$\1\$)/i;

/** Blanks the "old" argument of every pair in (regexp_)replace chains, plus LIKE / ~ operands. */
function blankSearchPatterns(sql) {
  let out = "";
  let i = 0;
  const chainStart = /(?:regexp_)?replace\(\s*(?:(?:regexp_)?replace\(\s*)*[^,()']+(?:\([^()]*\))?[^,()']*,/gi;
  for (const m of sql.matchAll(chainStart)) {
    if (m.index < i) continue;
    out += sql.slice(i, m.index + m[0].length);
    let j = m.index + m[0].length;
    for (;;) {
      const ws = sql.slice(j).match(/^\s*/)[0];
      const oldLit = sql.slice(j + ws.length).match(SQL_LITERAL);
      if (!oldLit) break;
      out += `${ws}''`;
      j += ws.length + oldLit[0].length;
      const rest = sql.slice(j).match(/^\s*,\s*(?:'(?:[^']|'')*'|\$([a-z]*)\$[\s\S]*?\$\1\$)(?:\s*,\s*'[a-z]*')?\s*\)\s*,/i);
      if (!rest) break;
      out += rest[0];
      j += rest[0].length;
    }
    i = j;
  }
  out += sql.slice(i);
  return out
    .replace(/\bI?LIKE\s+'(?:[^']|'')*'/gi, "LIKE ''")
    .replace(/!?~\*?\s*'(?:[^']|'')*'/g, "~ ''");
}

function checkBanned(label, text) {
  const lower = (text ?? "").toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    const hit = phrase === "TODO" ? /\bTODO\b/.test(text ?? "") : lower.includes(phrase.toLowerCase());
    if (hit) error(`${label}: banned phrase "${phrase}"`);
  }
}

function makeAdminPathChecker() {
  const routes = loadRoutePatterns();
  const navHrefs = new Set(loadNavHrefs());
  return (path) => {
    if (navHrefs.has(path)) return true;
    if (/\[|\]|:[a-z]/i.test(path)) {
      const generic = path.replace(/\[[^\]]+\]|:[a-zA-Z_]+/g, "x");
      return routes.some((re) => re.test(generic));
    }
    return routes.some((re) => re.test(path));
  };
}

function checkAdminPaths(label, text, isKnown) {
  for (const path of new Set(extractAdminPaths(text))) {
    if (path.startsWith("/admin/knowledge-base/")) continue;
    if (!isKnown(path)) error(`${label}: admin path ${path} is not a route in nav.ts or App.tsx`);
  }
}

function checkQuiz(label, quiz) {
  if (quiz == null) return;
  if (!Array.isArray(quiz)) {
    error(`${label}: checkpoint_quiz is not an array`);
    return;
  }
  for (const q of quiz) {
    const n = Array.isArray(q?.choices) ? q.choices.length : 0;
    if (!q?.id || !q?.prompt) error(`${label}: quiz question missing id or prompt`);
    if (n < 2 || n > 6) error(`${label}: quiz ${q?.id} has ${n} choices (expected 2-6)`);
    if (!Number.isInteger(q?.answer_index) || q.answer_index < 0 || q.answer_index >= n) {
      error(`${label}: quiz ${q?.id} answer_index out of range`);
    }
    checkBanned(`${label} quiz ${q?.id}`, JSON.stringify(q));
  }
}

async function runDatabase() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run with --static");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const [articlesRes, categoriesRes, pathsRes, homeRes] = await Promise.all([
    db
      .from("learning_articles")
      .select("id, slug, title, summary, body, status, audience, is_internal, category_id")
      .is("tenant_id", null),
    db.from("learning_categories").select("id, slug").is("tenant_id", null),
    db.from("learning_training_paths").select("slug, article_slugs, checkpoint_quiz"),
    db.from("learning_homepage_sections").select("section_key, payload").is("tenant_id", null),
  ]);
  for (const res of [articlesRes, categoriesRes, pathsRes, homeRes]) {
    if (res.error) {
      console.error(res.error.message);
      process.exit(1);
    }
  }

  const articles = articlesRes.data;
  const bySlug = new Map(articles.map((a) => [a.slug, a]));
  const byId = new Map(articles.map((a) => [a.id, a]));
  const categoryIds = new Set(categoriesRes.data.map((c) => c.id));
  const published = (a) => a?.status === "published";
  const publicPublished = (a) => published(a) && !a.is_internal;

  const mockupIds = loadMockupIds();
  const isKnownAdminPath = makeAdminPathChecker();

  for (const a of articles) {
    if (!categoryIds.has(a.category_id)) error(`${a.slug}: category ${a.category_id} does not exist`);
    if (!published(a)) continue;
    const label = a.slug;
    if (!a.summary?.trim()) error(`${label}: missing summary`);
    checkBanned(label, `${a.title}\n${a.summary}\n${a.body}`);

    for (const slug of extractLearnLinks(a.body)) {
      if (!publicPublished(bySlug.get(slug))) error(`${label}: links to /learn/article/${slug} which is not a published public article`);
    }
    for (const slug of extractKbLinks(a.body)) {
      if (!published(bySlug.get(slug))) error(`${label}: links to /admin/knowledge-base/${slug} which is not published`);
    }
    for (const id of extractMockups(a.body)) {
      if (!mockupIds.has(id)) error(`${label}: unknown mockup id "${id}"`);
    }
    if (a.is_internal) {
      checkAdminPaths(label, a.body, isKnownAdminPath);
    } else if (stripHtml(a.body).length < MIN_PUBLIC_TEXT_LENGTH) {
      warn(`${label}: public body is only ${stripHtml(a.body).length} characters of text`);
    }
  }

  for (const p of pathsRes.data) {
    for (const slug of p.article_slugs ?? []) {
      if (!published(bySlug.get(slug))) error(`training path ${p.slug}: step ${slug} is not a published article`);
    }
    checkQuiz(`training path ${p.slug}`, p.checkpoint_quiz);
  }

  for (const section of homeRes.data) {
    const payload = section.payload ?? {};
    const label = `homepage ${section.section_key}`;
    for (const id of payload.article_ids ?? []) {
      if (!publicPublished(byId.get(id))) error(`${label}: article id ${id} is not a published public article`);
    }
    const raw = JSON.stringify(payload);
    for (const slug of extractLearnLinks(raw)) {
      if (!publicPublished(bySlug.get(slug))) error(`${label}: links to /learn/article/${slug} which is not a published public article`);
    }
    checkBanned(label, raw);
  }

  const internalText = articles
    .filter((a) => a.is_internal && published(a))
    .map((a) => a.body ?? "")
    .join("\n");
  for (const href of loadNavHrefs()) {
    if (NAV_COVERAGE_EXCLUSIONS.has(href)) continue;
    const re = new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-zA-Z0-9_-])`);
    if (!re.test(internalText)) error(`nav coverage: ${href} is not mentioned in any internal article`);
  }

  const counts = articles.filter(published).reduce((acc, a) => {
    acc[a.audience] = (acc[a.audience] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`published articles by audience: ${JSON.stringify(counts)}`);
}

function runStatic(files) {
  const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const learning = all.filter((f) => /learning/.test(f));
  const targets =
    files.length > 0
      ? files
      : learning.filter((f) => Number.parseInt(f, 10) >= 10126).map((f) => join(MIGRATIONS_DIR, f));

  const declared = new Set();
  for (const f of learning) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    for (const m of sql.matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)+)'/g)) declared.add(m[1]);
  }
  const archived = new Set(["yoco-terminal-overview", "yoco-terminal-payment", "yoco-setup", "yoco-walk-in-payment"]);

  const mockupIds = loadMockupIds();
  const isKnownAdminPath = makeAdminPathChecker();

  for (const file of targets) {
    const label = file.replace(/^.*[\\/]/, "");
    const sql = readFileSync(file, "utf8");
    const content = sql
      .split(/\r?\n/)
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
    // Search patterns (replace "old" arguments, LIKE and regex match operands) may name stale text.
    const bannedScope = blankSearchPatterns(content);
    checkBanned(label, bannedScope);
    for (const slug of extractLearnLinks(bannedScope)) {
      if (archived.has(slug) && !/archived/i.test(content)) error(`${label}: links to archived article ${slug}`);
      else if (!declared.has(slug)) error(`${label}: links to /learn/article/${slug} which no learning migration declares`);
    }
    for (const id of extractMockups(content)) {
      if (!mockupIds.has(id)) error(`${label}: unknown mockup id "${id}"`);
    }
    checkAdminPaths(label, bannedScope, isKnownAdminPath);
  }
  console.log(`static check: ${targets.length} file(s), ${declared.size} declared slugs`);
}

const args = process.argv.slice(2);
if (args[0] === "--static") {
  runStatic(args.slice(1));
} else {
  await runDatabase();
}

for (const w of warnings) console.warn(`warn: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length > 0 ? 1 : 0);
