import { ErrorState } from "@/components/ui/ErrorState";
import { isFinancePermissionDenied } from "@/lib/finance-report-errors";

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
