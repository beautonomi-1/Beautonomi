export function deepMergeDraftData(
  existing: Record<string, unknown>,
  patch: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  if (!patch || typeof patch !== "object") return { ...existing };

  const result: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    const existingValue = result[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof existingValue === "object" &&
      existingValue !== null &&
      !Array.isArray(existingValue)
    ) {
      result[key] = deepMergeDraftData(
        existingValue as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
