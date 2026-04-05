import { DashboardClient } from "./DashboardClient";
import { fetchDashboardInitial } from "./fetch-dashboard-initial";

export const dynamic = "force-dynamic";

export default async function ProviderDashboardPage() {
  const { stats, error, missingProfile } = await fetchDashboardInitial();

  return (
    <DashboardClient
      initialStats={stats}
      initialLoadError={error}
      initialMissingProfile={missingProfile}
    />
  );
}
