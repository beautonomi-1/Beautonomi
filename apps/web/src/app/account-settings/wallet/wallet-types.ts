export type WalletData = {
  id: string;
  balance: number;
  currency: string;
};

export type WalletTx = {
  id: string;
  type: "credit" | "debit";
  amount: number;
  description?: string | null;
  reference_type?: string | null;
  created_at: string;
};

export type WalletInitialPayload = {
  wallet: WalletData;
  transactions: WalletTx[];
};
