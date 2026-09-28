# Data Retention and Deletion Schedule

> Confirm each period with legal counsel. POPIA s14 requires records to be kept no longer than necessary unless the law or a contract requires longer.

| Record | Retention | Legal driver | Deletion method |
|---|---|---|---|
| Customer account profile | While active; [24 months] after last activity | POPIA s14 | `inactivity-retention` job |
| Bookings and invoices | [5 years] after the transaction | Tax Administration Act; Companies Act | Anonymise personal fields after period |
| Payment and payout records | [5 years] | Financial and tax records | Anonymise after period |
| Provider KYC (ID documents, selfies) | Duration of relationship + [5 years] | FICA (where applicable) | Delete from storage and verification provider |
| Support messages and disputes | [3 years] after closure | Legitimate interest (claims) | Scheduled purge |
| Marketing consent records | While consent is active + [3 years] | Proof of consent (POPIA s69) | Scheduled purge |
| Admin audit logs (`audit_logs`) | [3 years] | Security and accountability | `purge-audit-logs` job |
| GRC records and evidence | At least 3 years (one full ISO certification cycle) | ISO 27001 records | Manual review; evidence is append-only |
| Analytics events | Per vendor setting ([12 months]) | Legitimate interest | Vendor retention setting |
| Error traces (Sentry) | [90 days] | Legitimate interest | Vendor retention setting |

Compliance purges (on request or legal instruction) are recorded in `compliance_purge_audit_log`. The hub's data-retention collector reports purge activity weekly.
