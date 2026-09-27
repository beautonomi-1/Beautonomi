# Supplier Security Policy

## 1. Scope

Any supplier that processes Beautonomi personal information, hosts production services, or can change our code or configuration.

## 2. Before onboarding

1. Add the supplier to the vendor register with service, data processed, data location and criticality.
2. **Critical/high suppliers:** obtain a current SOC 2 Type II report or ISO 27001 certificate, or complete a security questionnaire. Record the result as a vendor assessment.
3. Sign a data processing agreement meeting POPIA s21 and, where applicable, GDPR Art. 28.
4. Confirm cross-border transfer safeguards (POPIA s72).
5. Enable SSO/MFA for our accounts where available.

## 3. Ongoing

- Review critical suppliers **yearly** and others every **two years**: certification currency, incidents, changes in sub-processors, data location.
- Track certification expiry dates in the vendor register.
- Watch supplier security advisories as part of threat intelligence.

## 4. Offboarding

Remove access and API keys, request deletion or return of data, and record completion.

## 5. Cloud services

Supabase and Vercel host production. Their physical and environmental controls are inherited and verified through their assurance reports. Keep an exit plan: data can be exported from Supabase with `pg_dump` and storage exports.
