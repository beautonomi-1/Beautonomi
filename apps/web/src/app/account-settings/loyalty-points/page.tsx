import LoyaltyPointsPageClient from "./LoyaltyPointsPageClient";
import { fetchLoyaltyPointsInitial } from "./fetch-loyalty-points-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialLoyaltyPoints = await fetchLoyaltyPointsInitial();
  return <LoyaltyPointsPageClient initialLoyaltyPoints={initialLoyaltyPoints} />;
}
