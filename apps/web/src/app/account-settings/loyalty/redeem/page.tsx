import LoyaltyRedeemPageClient from "./LoyaltyRedeemPageClient";
import { fetchLoyaltyInitial } from "../fetch-loyalty-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialLoyalty = await fetchLoyaltyInitial();
  return <LoyaltyRedeemPageClient initialLoyalty={initialLoyalty} />;
}
