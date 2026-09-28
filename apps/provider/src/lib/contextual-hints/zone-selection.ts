/** True when platform returned zones but none are actively selected for this provider. */
export function providerHasNoActiveServiceZones(
  zones: { is_selected?: boolean; selection?: { is_active?: boolean } | null }[] | null | undefined,
): boolean {
  if (!zones || zones.length === 0) return false;
  return !zones.some((z) => z.is_selected && z.selection?.is_active !== false);
}
