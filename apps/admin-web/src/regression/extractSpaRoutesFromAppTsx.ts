/**
 * Derive registered React Router path patterns from App.tsx (single source of truth for regression tests).
 * Control-plane children are prefixed with `control-plane/`.
 */
export function extractSpaRoutePatternsFromAppTsx(appSrc: string): string[] {
  const paths = new Set<string>();

  // `[^>]*` would stop at `>` inside `element={<Outlet />}` — match the full opening tag explicitly.
  const cpMatch = appSrc.match(
    /<Route\s+path="control-plane"\s+element=\{<Outlet\s*\/>\}\s*>\s*([\s\S]*?)\s*<\/Route>/
  );
  if (!cpMatch || cpMatch.index === undefined) {
    throw new Error('App.tsx must contain a <Route path="control-plane">…</Route> block');
  }

  const cpStartIdx = cpMatch.index;
  const beforeCp = appSrc.slice(0, cpStartIdx);
  const cpInner = cpMatch[1];
  const afterCp = appSrc.slice(cpStartIdx + cpMatch[0].length);

  const addFromSnippet = (snippet: string, prefix?: string) => {
    for (const m of snippet.matchAll(/path="([^"]+)"/g)) {
      const p = m[1];
      if (p === "control-plane") continue;
      if (p === "*" || p.includes("..")) continue;
      paths.add(prefix ? `${prefix}${p}` : p);
    }
  };

  addFromSnippet(beforeCp);
  addFromSnippet(cpInner, "control-plane/");
  addFromSnippet(afterCp);

  return [...paths].sort((a, b) => b.length - a.length || a.localeCompare(b));
}
