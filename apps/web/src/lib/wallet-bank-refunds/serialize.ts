export type CustomerBankAccountRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  account_number_encrypted?: string | null;
  account_number_last4: string;
  account_name: string;
  bank_code: string;
  bank_name?: string | null;
  country: string;
  currency: string;
  recipient_type: string;
  payout_rail?: string | null;
  verified?: boolean;
  verification_source?: string | null;
  name_match?: string | null;
  verified_at?: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export function serializeCustomerBankAccount(row: CustomerBankAccountRow) {
  const { account_number_encrypted: _enc, ...rest } = row;
  return rest;
}

export type WalletBankRefundRequestRow = Record<string, unknown>;

export function serializeWalletBankRefundRequest(row: WalletBankRefundRequestRow) {
  const { account_number_encrypted: _enc, ...rest } = row;
  return rest;
}
