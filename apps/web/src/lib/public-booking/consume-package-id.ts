/**
 * Resolve catalog package id for hold consume — explicit body keys override hold metadata.
 */
export function resolveConsumePackageId(args: {
  body: Record<string, unknown>;
  packageId: string | null | undefined;
  primaryPackageId: string | null | undefined;
  holdMetaPackageId?: string | null;
  holdMetaPrimaryPackageId?: string | null;
}): string | undefined {
  const explicitPackageKeysInBody =
    args.body != null &&
    typeof args.body === "object" &&
    ("package_id" in args.body || "primary_package_id" in args.body);

  if (explicitPackageKeysInBody) {
    const raw = args.packageId ?? args.primaryPackageId;
    return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  }

  const requested = (args.packageId ?? args.primaryPackageId) ?? undefined;
  if (requested) return requested;

  if (typeof args.holdMetaPackageId === "string" && args.holdMetaPackageId.trim()) {
    return args.holdMetaPackageId.trim();
  }
  if (typeof args.holdMetaPrimaryPackageId === "string" && args.holdMetaPrimaryPackageId.trim()) {
    return args.holdMetaPrimaryPackageId.trim();
  }
  return undefined;
}
