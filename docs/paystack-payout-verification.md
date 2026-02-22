# Paystack payout account verification and costs

## Verification API cost (per [Paystack docs](https://paystack.com/docs/api/))

- **Nigeria (NG) / Ghana (GH):** Resolve Account Number (`GET /bank/resolve`) is **free**.
- **South Africa (ZA):** Account validation is **ZAR 3 per successful API call** (deducted from your Paystack balance).

So every time we call the verify (resolve) endpoint for a ZA account, it costs ZAR 3. We should avoid calling it twice in the same “add payout account” flow.

## How we avoid double charge

1. **Client verifies first (optional step):** User clicks “Verify” in the app → we call `POST /api/provider/payout-accounts/verify` → one Paystack resolve/validation call (one charge in ZA).
2. **Client adds account:** User clicks “Add account”. If the client **sends the name we got from the verify step** as `verified_account_name`, the server **skips** calling Paystack verify again and uses that name. So we only pay once (when they clicked Verify). If they add without having verified, the server calls verify once, then creates the recipient.

So: **Verify in UI then Add** = one charge. **Add without verifying** = one charge (server verifies). We no longer verify twice (UI + server) for the same account.

## If we don’t verify before adding

If we ever allowed adding an account without any verification (no server verify, no `verified_account_name`), we would send the user-entered name to Paystack and create a transfer recipient. That would avoid the ZAR 3 validation cost, but:

- **Risk:** Wrong account number or bank code can create a recipient that fails on first transfer.
- **Paystack behaviour:** For South Africa, Paystack recommends validating before creating the recipient. In other countries, resolve is free so we always verify.

So the current design is: we always ensure the account is verified exactly once (either in the “Verify” step or on “Add” when no pre-verified name is sent).

## Superadmin-controlled: skip verification and bank confirmation letter

**Skip verification** is controlled only by **superadmin** via platform settings (Admin → Settings → Paystack tab: “Skip payout account verification”). Providers cannot turn this on themselves.

### How it works

1. **Superadmin turns on “Skip payout account verification”**  
   In Admin → Settings → Paystack, enable **Skip payout account verification (superadmin)**. Save.

2. **Provider adds payout account**  
   When a provider adds a bank account, the server **does not** call Paystack verify. It creates the Paystack transfer recipient using the **user-entered** `account_name`, `account_number`, and `bank_code`. No ZAR 3 (or other verify) charge at add time.

3. **Transfer recipient exists**  
   The recipient is stored in Paystack and in our DB. Payouts can be initiated to this recipient as usual.

4. **When a payout is requested**  
   Your system (or an admin) initiates the transfer to that recipient.  
   - If the account details are correct, the transfer succeeds.  
   - If they are wrong, the transfer **fails** (e.g. “account not found”, “bank rejected”).

5. **If the transfer fails: provider uploads bank confirmation letter**  
   Policy: the **provider must upload a bank confirmation letter** (or similar document from the bank) that confirms the account holder name, account number, and bank/branch. Admin reviews the document and the payout account details; once satisfied, admin can retry the transfer (e.g. after correcting the recipient in Paystack or asking the provider to fix details in the app). So “verification” when skip is on is done **after** a failure, via document upload and admin review, not via Paystack’s paid verify API.

6. **Admin and Paystack dashboard**  
   Failed transfers appear in [Paystack Dashboard → Transfers](https://dashboard.paystack.com/#/transfers). Admin can see failed status, correct the recipient or add a new one, and initiate a new transfer. The bank confirmation letter is handled in your process (e.g. provider uploads in app or by email; admin approves and then retries).

### How we know a payout failed

The system learns that a payout failed in two ways:

1. **Paystack webhook**  
   When a transfer fails (e.g. wrong account, bank rejected), Paystack sends a webhook to our server:
   - **`transfer.failed`** – transfer could not be processed (e.g. processor/bank issue).
   - **`transfer.reversed`** – transfer was reversed; amount returned, can be retried.

   Our webhook handler (`/api/payments/webhook`, transfer-events) receives these events, finds the payout by `transfer_code` or reference, and updates the **payout record** to `status: "failed"`, with `failed_at` and `failure_reason` (from Paystack’s `reason`, `message`, or `gateway_response`). So every failed transfer is reflected in our database.

2. **Admin payouts list**  
   In **Admin → Payouts**, admin can filter and see payouts with status **Failed**. Each failed row has the stored failure reason. That is where admin sees that a payout failed and can follow the bank confirmation letter process (notify provider, collect document, then retry or fix the recipient and initiate a new transfer).

3. **Paystack Dashboard (optional)**  
   Admin can also open [Paystack Dashboard → Transfers](https://dashboard.paystack.com/#/transfers), filter by failed, and see the same failed transfers with Paystack’s details. Useful for debugging or when correcting the recipient before retrying.

### When to use

- Turn **on** “Skip payout account verification” when you want **zero verification cost at add-time** and accept that some first transfers may fail; you’ll follow the bank confirmation letter process when that happens.
- Leave it **off** (default) when you want Paystack verify at add-time so invalid accounts are caught before the first payout.

## Handling failed transfers in the Paystack portal

If a transfer fails (e.g. wrong account, bank rejection):

1. **Dashboard:** Go to [Paystack Dashboard → Transfers](https://dashboard.paystack.com/#/transfers).
2. **Filter:** Use status filters to see failed transfers; search by transfer code or reference if needed.
3. **Fix:** You can correct the recipient (or add a new payout account with correct details) and initiate a new transfer. Failed transfers do not auto-retry; the provider must fix details and try again.

So “if it doesn’t verify immediately” or if a transfer fails later, it’s handled **in the Paystack portal** by viewing the failed transfer and re-trying with corrected account details or a new recipient.

## References

- [Paystack API – Resolve account number](https://paystack.com/docs/api/#resolve-account-number)
- [Paystack – Identity verification pricing](https://support.paystack.com/en/articles/2130818) (ZAR 3 for South Africa account validation)
- [Paystack – Transfers](https://support.paystack.com/en/articles/2132866) (viewing and managing transfers in the dashboard)
