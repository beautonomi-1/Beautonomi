import { useRouter } from "expo-router";
import { ErrorState } from "@/components/ui/ErrorState";
import { isFinancePermissionDenied } from "@/lib/finance-report-errors";
import { isPlanGateErrorCode } from "@/lib/plan-gate";
import { useTranslation } from "@beautonomi/i18n";

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
  permissionMessage,
}: FinanceReportErrorProps) {
  const { t } = useTranslation();
  const fe = (key: string) => t(`provider.mobile.components.financeReportError.${key}`) as string;
  const resolvedPermission = permissionMessage ?? fe("permissionDefault");
  const router = useRouter();

  if (isPlanGateErrorCode(errorCode)) {
    const title =
      errorCode === "LIMIT_REACHED" || errorCode === "SUBSCRIPTION_LIMIT_EXCEEDED"
        ? fe("planLimitReached")
        : errorCode === "TERMINAL_LIMIT_REACHED"
          ? fe("terminalLimitReached")
          : fe("notIncluded");
    return (
      <ErrorState
        icon="lock-closed-outline"
        title={title}
        message={error ?? fe("upgradeRequired")}
        onRetry={() => router.push("/(app)/(tabs)/more/settings/subscription" as never)}
        retryLabel={fe("viewPlans")}
      />
    );
  }

  if (isFinancePermissionDenied(errorCode ?? null, error)) {
    return (
      <ErrorState
        icon="lock-closed-outline"
        title={fe("noAccess")}
        message={resolvedPermission}
        onRetry={onRetry}
        retryLabel={fe("tryAgain")}
      />
    );
  }
  return <ErrorState message={error ?? fe("genericError")} onRetry={onRetry} />;
}
