# Incident Response Plan

## 1. Severity levels

| Level | Definition | Response target |
|---|---|---|
| SEV-1 Critical | Confirmed breach of Restricted data, payment fraud at scale, full outage | Incident lead within 15 minutes; management informed within 1 hour |
| SEV-2 High | Suspected breach, admin account compromise, major feature outage | Within 1 hour |
| SEV-3 Medium | Contained security event, limited outage | Within 1 working day |
| SEV-4 Low | Policy violation without data exposure | Within 5 working days |

## 2. Roles

- **Incident lead:** [security lead]; deputy [name]. Runs the response and keeps the timeline.
- **Technical responders:** engineering and IT operations on call.
- **Information Officer:** decides on notification to the Information Regulator and data subjects.
- **Communications:** [name]; approves all external messages.
- **Management:** approves major decisions (e.g. taking systems offline, paying for forensics).

## 3. Phases

1. **Detect and report.** Anyone can report to [security@ / #security]. Sentry alerts, provider alerts and customer reports are triaged by the on-call engineer.
2. **Triage.** Classify severity; decide if personal information is involved; open an incident record in the hub.
3. **Contain.** Revoke sessions and keys, disable affected accounts or features, block abusive IPs. Record the contained time.
4. **Preserve evidence.** Export relevant logs (Vercel, Supabase, Sentry, audit_logs) and upload to the evidence locker so they are hashed.
5. **Eradicate and recover.** Fix the cause, rotate secrets, restore from backup if needed. Record the resolved time.
6. **Notify.** See section 4.
7. **Review.** Blameless post-incident review within 10 working days for SEV-1/2; record root cause, lessons and corrective actions as findings.

## 4. Personal data breaches

- **POPIA s22:** notify the Information Regulator and affected data subjects as soon as reasonably possible after discovering the compromise, unless the identity of data subjects can't be established. Use the Regulator's prescribed form.
- **GDPR Art. 33/34 (where applicable):** notify the lead supervisory authority within 72 hours; tell affected people without undue delay if the risk is high.
- Record the decision and times in the incident record, including a decision **not** to notify and why.

## 5. Key contacts

| Contact | Details |
|---|---|
| Information Regulator | [contact details from inforegulator.org.za] |
| SAPS cybercrime | [contact] |
| Supabase support | [plan-specific support channel] |
| Vercel support | [contact] |
| Payment providers | [fraud/security contacts] |
| Legal counsel | [contact] |
| Cyber insurer | [policy number and hotline] |

## 6. Testing

Run a tabletop exercise at least yearly and record it as a BC/DR test.
