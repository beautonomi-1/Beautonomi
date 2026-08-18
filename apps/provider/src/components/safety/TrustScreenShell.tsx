import { useTranslation } from "@beautonomi/i18n";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useFromSafetyHub, useSafetyStackBack } from "@/lib/provider-tab-navigation";

type TrustScreenShellProps = {
  title: string;
  /** Screen-specific subtitle (shown below title). */
  subtitle?: string;
  /** Breadcrumb segment after Trust & Safety, e.g. "Content controls". */
  breadcrumbSegment?: string;
  rightAction?: React.ReactNode;
  /** Override default safety stack back (e.g. unsaved-changes guard). */
  onBack?: () => void;
};

/**
 * Standard header for Trust & Safety child screens — back + optional breadcrumb.
 */
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

  const hubLabel = t("provider.mobile.screens.safetyHub.breadcrumbHub", {
    defaultValue: t("customer.mobile.screens.safetyHub.title"),
  });

  const breadcrumbSubtitle =
    fromSafety && breadcrumbSegment
      ? `${hubLabel} › ${breadcrumbSegment}`
      : subtitle;

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
