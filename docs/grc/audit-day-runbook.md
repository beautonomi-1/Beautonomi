# Audit day runbook

Auditors get **packs only**: no login to the hub.

1. Confirm `grc_hub_enabled` is on and every GRC user can sign in with MFA (AAL2).
2. Check **Security & Compliance → Overview**: activity log integrity must read *intact*. If it reads *broken*, stop and escalate before producing any pack.
3. In **Audit packs**, request a pack for the review period. Keep *Redact personal data* on unless the auditor has a signed need for identities.
4. Packs build in the background (`/api/cron/grc-audit-packs`, every 10 minutes). The status moves *queued → building → ready*, or *failed* with a reason.
5. Download the zip. Send the **manifest SHA-256** shown in the list to the auditor through a different channel from the zip.
6. The auditor verifies: `sha256sum manifest.json` matches the hash you sent, and each file's SHA-256 matches its entry in `manifest.json`. The README in the pack walks them through this, and through the activity-log chain check.
7. Every download is recorded in `grc_audit_pack_downloads` and the activity log.
8. Evidence larger than the pack budget (150 MB) is listed in `manifest.json → omitted_evidence`. Share those items separately from the evidence locker if requested.
9. Escalation: GRC admin + security lead.
