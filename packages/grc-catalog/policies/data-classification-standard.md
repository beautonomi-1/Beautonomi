# Data Classification and Handling Standard

## 1. Levels

| Level | Examples | Handling |
|---|---|---|
| **Restricted** | Identity documents and selfies (KYC), bank details, health/consent forms, authentication secrets, service-role keys, audit packs | Need-to-know only; encrypted at rest and in transit; never exported to personal devices or email; access logged |
| **Confidential** | Customer and provider contact details, bookings, messages, addresses and location, payment references, internal financials | Role-based access; share only through approved systems; redact in exports unless needed |
| **Internal** | Policies, architecture docs, source code, internal metrics | Staff and approved contractors only |
| **Public** | Marketing site, published provider listings, public policies | No restrictions |

## 2. Rules

- The asset owner sets the classification; the default for anything containing personal information is **Confidential**.
- Classification is recorded in the asset register and on documents where practical (header or file name).
- Audit packs redact personal information by default; unredacted packs need approval from the Information Officer.
- Screenshots used as evidence must not show Restricted data.

## 3. Transfer

- Use encrypted channels only (HTTPS, SFTP, provider APIs).
- Don't email Restricted data. Use expiring, access-controlled links.

## 4. Disposal

Delete per the Data Retention and Deletion Schedule. Wipe or destroy devices before disposal.
