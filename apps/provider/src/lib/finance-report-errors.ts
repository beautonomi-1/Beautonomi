/** True when a finance/report API call failed due to missing role permission. */
export function isFinancePermissionDenied(
  errorCode: string | null | undefined,
  error: string | null | undefined,
): boolean {
  if (errorCode === "FORBIDDEN" || errorCode === "UNAUTHORIZED") return true;
  const msg = (error ?? "").toLowerCase();
  return (
    msg.includes("permission") ||
    msg.includes("not authorized") ||
    msg.includes("access denied") ||
    msg.includes("do not have access")
  );
}
