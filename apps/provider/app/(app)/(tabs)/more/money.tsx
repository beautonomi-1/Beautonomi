import { useMemo } from "react";
import { FinanceHubShell } from "@/components/finance/FinanceHubShell";
import { ActiveLocationChip } from "@/components/reports/ActiveLocationChip";
import { FinanceOverviewContent } from "./finance";
import { TransactionsContent } from "./transactions";
import { SalesHistoryContent } from "./sales-history";
import { PayoutsContent } from "./payouts";

export default function MoneyHubScreen() {
  const tabs = useMemo(
    () => [
      { id: "overview", label: "Overview", render: () => <FinanceOverviewContent /> },
      { id: "ledger", label: "Ledger", render: () => <TransactionsContent embedded /> },
      { id: "sales", label: "Sales", render: () => <SalesHistoryContent embedded /> },
      { id: "payouts", label: "Payouts", render: () => <PayoutsContent /> },
    ],
    [],
  );

  return (
    <FinanceHubShell
      title="Money"
      subtitle="Earnings, ledger, sales & payouts"
      tabs={tabs}
      defaultTab="overview"
      headerExtra={<ActiveLocationChip />}
    />
  );
}
