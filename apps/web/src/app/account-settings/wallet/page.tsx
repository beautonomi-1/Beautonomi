import { Suspense } from "react";
import { NativeAppCheckoutBounce } from "@/components/payments/NativeAppCheckoutBounce";
import WalletPageClient from "./WalletPageClient";
import { fetchWalletInitial } from "./fetch-wallet-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialWallet = await fetchWalletInitial();
  return (
    <>
      <Suspense fallback={null}>
        <NativeAppCheckoutBounce />
      </Suspense>
      <WalletPageClient initialWallet={initialWallet} />
    </>
  );
}
