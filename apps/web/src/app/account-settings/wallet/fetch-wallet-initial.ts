import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getWallet } from "@/app/api/me/wallet/route";
import type { WalletInitialPayload } from "./wallet-types";

export async function fetchWalletInitial(): Promise<WalletInitialPayload | null> {
  const req = await createNextRequestFromHeaders("/api/me/wallet");
  const res = await getWallet(req);
  const json = (await res.json().catch(() => ({}))) as {
    data?: WalletInitialPayload;
  };
  if (!res.ok || !json?.data?.wallet) return null;
  return {
    wallet: json.data.wallet,
    transactions: Array.isArray(json.data.transactions) ? json.data.transactions : [],
  };
}
