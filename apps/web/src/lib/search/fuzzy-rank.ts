/**
 * Client-side ranking helpers for search suggestions and relevance sorting.
 * Complements SQL ilike (substring) with typo-tolerance and multi-token scoring.
 */

export function normalizeSearchText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip characters that break PostgREST ilike filters */
export function sanitizeIlikeToken(raw: string): string {
  return raw.replace(/[%_,]/g, "").trim().slice(0, 60);
}

/** Full phrase plus per-word tokens (min length 2) for broader recall */
export function expandSearchTokens(searchTerm: string): string[] {
  const cleaned = normalizeSearchText(searchTerm).replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  const full = sanitizeIlikeToken(cleaned);
  if (full.length >= 1) out.add(full);
  for (const t of cleaned.split(/\s+/)) {
    const tok = sanitizeIlikeToken(t);
    if (tok.length >= 1) out.add(tok);
  }
  return [...out];
}

/** PostgREST `.or()` filter: any column matches any token */
export function buildIlikeOrClause(columns: string[], tokens: string[]): string {
  const parts: string[] = [];
  for (const col of columns) {
    for (const tok of tokens) {
      const t = sanitizeIlikeToken(tok);
      if (t.length < 1) continue;
      parts.push(`${col}.ilike.%${t}%`);
    }
  }
  return parts.join(",");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Best match score when comparing query to one or more candidate strings (e.g. title + subtitle).
 * Higher is better.
 */
export function fuzzyTextRelevanceScore(queryRaw: string, ...candidateParts: string[]): number {
  const q = normalizeSearchText(queryRaw);
  if (!q.length) return 0;
  let best = 0;
  for (const part of candidateParts) {
    const c = normalizeSearchText(part);
    if (!c.length) continue;
    let score = 0;
    if (c === q) score = 10_000;
    else if (c.startsWith(q)) score = 5000 + Math.max(0, 200 - c.length);
    else {
      const idx = c.indexOf(q);
      if (idx >= 0) score = 3000 + Math.max(0, 150 - idx);
    }
    if (score === 0) {
      const qTokens = q.split(" ").filter((t) => t.length > 1);
      const allTokens = qTokens.length > 0 && qTokens.every((t) => c.includes(t));
      if (allTokens && qTokens.length > 1) score = 2500;
      else if (allTokens) score = 2200;
    }
    if (score === 0) {
      const qHead = q.slice(0, Math.min(14, q.length));
      const cSlice = c.slice(0, Math.min(28, c.length));
      const compareLen = Math.max(qHead.length, Math.min(cSlice.length, qHead.length + 3));
      const dist = levenshtein(qHead, cSlice.slice(0, compareLen));
      const maxL = Math.max(qHead.length, 1);
      const sim = 1 - dist / maxL;
      if (sim >= 0.75) score = Math.round(900 * sim);
      else if (sim >= 0.58) score = Math.round(450 * sim);
    }
    if (score > best) best = score;
  }
  return best;
}
