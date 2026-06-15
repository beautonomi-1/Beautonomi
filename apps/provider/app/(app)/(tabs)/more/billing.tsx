import { useMemo } from "react";
import { FinanceHubShell } from "@/components/finance/FinanceHubShell";
import { SubscriptionContent } from "./subscription";
import { InvoicesContent } from "./invoices";
import { BillingHistoryContent } from "./billing-history";
import { VATReportsContent } from "./vat-reports";

export default function BillingHubScreen() {
  const tabs = useMemo(
    () => [
      { id: "subscription", label: "Plan", render: () => <SubscriptionContent /> },
      { id: "invoices", label: "Invoices", render: () => <InvoicesContent embedded /> },
      { id: "bills", label: "Bills paid", render: () => <BillingHistoryContent /> },
      { id: "vat", label: "VAT", render: () => <VATReportsContent embedded /> },
    ],
    [],
  );

  return (
    <FinanceHubShell
      title="Billing"
      subtitle="Subscription, invoices, bills & VAT"
      tabs={tabs}
      defaultTab="subscription"
    />
  );
}
