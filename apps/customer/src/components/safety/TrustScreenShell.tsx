import { useTranslation } from "@beautonomi/i18n";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useFromSafetyHub, useSafetyStackBack } from "@/lib/customer-safety-navigation";

type TrustScreenShellProps = {
  title: string;
  subtitle?: string;
  breadcrumbSegment?: string;
  rightAction?: React.ReactNode;
  onBack?: () => void;
};

/** Standard header for Trust & Safety child screens — back + optional breadcrumb. */
export function TrustScreenShell({
  title,
  subtitle,
  breadcrumbSegment,
  rightAction,
  onBack,
}: TrustScreenShellProps) {
  const { t } = useTranslation();
  const defaultBack = useSafetyStackBack();
  const handleBack = onBack ?? defaultBack;
  const fromSafety = useFromSafetyHub();

  const hubLabel = t("customer.mobile.screens.safetyHub.breadcrumbHub", {
    defaultValue: t("customer.mobile.screens.safetyHub.title"),
  });

  const breadcrumbSubtitle =
    fromSafety && breadcrumbSegment ? `${hubLabel} › ${breadcrumbSegment}` : subtitle;

  return (
    <ScreenHeader
      title={title}
      subtitle={breadcrumbSubtitle}
      showBack
      onBack={handleBack}
      rightAction={rightAction}
    />
  );
}
