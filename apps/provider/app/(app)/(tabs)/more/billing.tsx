import { useCallback, useMemo } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { FinanceHubShell } from "@/components/finance/FinanceHubShell";
import { SubscriptionContent } from "./subscription";
import { InvoicesContent } from "./invoices";
import { BillingHistoryContent } from "./billing-history";
import { VATReportsContent } from "./vat-reports";

export default function BillingHubScreen() {
  const { t } = useTranslation();
  const bl = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.billing." + key, opts) as string,
    [t],
  );
  const tabs = useMemo(
    () => [
      { id: "subscription", label: bl("tabPlan"), render: () => <SubscriptionContent /> },
      { id: "invoices", label: bl("tabInvoices"), render: () => <InvoicesContent embedded /> },
      { id: "bills", label: bl("tabBillsPaid"), render: () => <BillingHistoryContent /> },
      { id: "vat", label: bl("tabVat"), render: () => <VATReportsContent embedded /> },
    ],
    [bl],
  );

  return (
    <FinanceHubShell
      title={bl("title")}
      subtitle={bl("subtitle")}
      tabs={tabs}
      defaultTab="subscription"
    />
  );
}
