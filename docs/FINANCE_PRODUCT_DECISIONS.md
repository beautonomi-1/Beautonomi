# Finance product decisions (accepted gaps)

Documented decisions as of the 2026 finance audit remediation. These are **intentional**
until a future phase explicitly schedules work.

| Topic | Decision | Rationale |
| --- | --- | --- |
| **Recurring booking auto-charge** | **Accepted gap** | Cron creates bookings only; payment is manual or a future Paystack subscription integration. See [customer-payments-and-recurring-bookings.md](./customer-payments-and-recurring-bookings.md). |
| **GL cutover (journal as payout SoT)** | **Deferred** | `finance_transactions` remains operational SoT; `journal_entries` is shadow GL with suspense for unmapped types. Trial balance is a control surface, not payout authority. |
| **Per-tenant customer wallets** | **Single global wallet** | Spec allows one wallet per user with strict currency rules. Migration `896` adds metadata currency at signup and zero-balance currency realignment on credit. Full per-tenant wallets deferred. |
| **Gift-card liability (admin UI)** | **Point-in-time balance** | `gift_cards.balance` sum is shown; period roll-forward in finance summary remains a future enhancement. |
| **Customer wallet cash-out** | **Not implemented** | Refunds credit wallet for rebooking only. Copy updated to stop promising bank/card payout. |
| **Ads via marketing credit** | **Fixed (no double deferred row)** | Marketing-credit-funded ads skip `provider_ads_payment`; recognition via `marketing_credit_recognition` only. |
| **Negative balance after payout** | **Organic recovery** | New earnings offset negative `rawBalance`; new payouts blocked. No dedicated clawback job; manual admin adjustment when needed. |
| **Admin finance metric timezone** | **UTC filters for now** | Metric contracts declare tenant TZ; API MTD uses UTC until tenant-local filters ship. |
