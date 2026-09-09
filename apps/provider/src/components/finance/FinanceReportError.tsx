import { useRouter } from "expo-router";
import { ErrorState } from "@/components/ui/ErrorState";
import { isFinancePermissionDenied } from "@/lib/finance-report-errors";
import { isPlanGateErrorCode } from "@/lib/plan-gate";

type FinanceReportErrorProps = {
  error: string | null;
  errorCode?: string | null;
  onRetry?: () => void;
  permissionMessage?: string;
};

export function FinanceReportError({
  error,
  errorCode,
  onRetry,
  permissionMessage = "Ask your business owner to grant view sales, view reports, or process payments permission for this report.",
}: FinanceReportErrorProps) {
  const router = useRouter();

  if (isPlanGateErrorCode(errorCode)) {
    const title =
      errorCode === "LIMIT_REACHED" || errorCode === "SUBSCRIPTION_LIMIT_EXCEEDED"
        ? "Plan limit reached"
        : errorCode === "TERMINAL_LIMIT_REACHED"
          ? "Terminal limit reached"
          : "Not included in your plan";
    return (
      <ErrorState
        icon="lock-closed-outline"
        title={title}
        message={error ?? "This feature requires a plan upgrade."}
        onRetry={() => router.push("/(app)/(tabs)/more/settings/subscription" as never)}
        retryLabel="View plans"
      />
    );
  }

  if (isFinancePermissionDenied(errorCode ?? null, error)) {
    return (
      <ErrorState
        icon="lock-closed-outline"
        title="You don't have access"
        message={permissionMessage}
        onRetry={onRetry}
        retryLabel="Try again"
      />
    );
  }
  return <ErrorState message={error ?? "Something went wrong"} onRetry={onRetry} />;
}
