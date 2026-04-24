import WalletPageClient from "./WalletPageClient";
import { fetchWalletInitial } from "./fetch-wallet-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialWallet = await fetchWalletInitial();
  return <WalletPageClient initialWallet={initialWallet} />;
}
