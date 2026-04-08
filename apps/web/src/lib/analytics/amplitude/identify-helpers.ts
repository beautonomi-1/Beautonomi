/**
 * Mirrors `packages/analytics/src/identify-helpers.ts` — keep in sync.
 * Amplitude Identify.set handling for arrays and mixed types (user segmentation).
 */
export function applyUserPropertiesToIdentify(
  IdentifyCtor: new () => any,
  userProperties: Record<string, unknown>
): any {
  const identify = new IdentifyCtor();
  for (const [k, v] of Object.entries(userProperties)) {
    if (v === null || v === undefined) continue;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      identify.set(k, v);
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      const primitive = v.every((x) => ["string", "number", "boolean"].includes(typeof x));
      if (primitive) {
        identify.set(k, v as string[] | number[] | boolean[]);
        continue;
      }
      identify.set(k, JSON.stringify(v));
      continue;
    }
    if (t === "object") {
      identify.set(k, JSON.stringify(v));
    }
  }
  return identify;
}
