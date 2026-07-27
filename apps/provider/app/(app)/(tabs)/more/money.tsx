import { useMemo, useState } from "react";
import { FinanceHubShell } from "@/components/finance/FinanceHubShell";
import { MoneyBranchFilter } from "@/components/finance/MoneyBranchFilter";
import { useApi } from "@/hooks/useApi";
import { FinanceOverviewContent } from "./finance";
import { TransactionsContent } from "./transactions";
import { SalesHistoryContent } from "./sales-history";
import { PayoutsContent } from "./payouts";

type TeamAccessPayload = {
  can_request_payouts?: boolean;
  is_business_owner?: boolean;
};

export default function MoneyHubScreen() {
  const [moneyLocationId, setMoneyLocationId] = useState<string | null>(null);

  const { data: teamAccess } = useApi<TeamAccessPayload>("/api/provider/team-access", {
    staleTimeMs: 60_000,
  });
  const canSeePayoutsTab =
    teamAccess == null ||
    teamAccess.can_request_payouts === true ||
    teamAccess.is_business_owner === true;

  const tabs = useMemo(() => {
    const all = [
      {
        id: "overview",
        label: "Overview",
        render: () => <FinanceOverviewContent locationId={moneyLocationId} />,
      },
      {
        id: "ledger",
        label: "Ledger",
        render: () => <TransactionsContent embedded locationId={moneyLocationId} />,
      },
      {
        id: "sales",
        label: "Sales",
        render: () => <SalesHistoryContent embedded locationId={moneyLocationId} />,
      },
      { id: "payouts", label: "Payouts", render: () => <PayoutsContent /> },
    ];
    return canSeePayoutsTab ? all : all.filter((tab) => tab.id !== "payouts");
  }, [canSeePayoutsTab, moneyLocationId]);

  return (
    <FinanceHubShell
      title="Money"
      subtitle="Earnings, ledger, sales & payouts"
      tabs={tabs}
      defaultTab="overview"
      headerExtra={
        <MoneyBranchFilter value={moneyLocationId} onChange={setMoneyLocationId} />
      }
    />
  );
}
