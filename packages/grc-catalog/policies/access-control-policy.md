# Access Control Policy

## 1. Purpose

Make sure only authorised people and systems can reach Beautonomi information, with access matched to their role.

## 2. Rules

### 2.1 Granting access

- Access is requested by the person's manager and approved by the system owner. Record the request and approval.
- Admin portal access uses role-based roles (`support_agent`, `admin_finance`, `admin_trust`, etc.). `superadmin` is limited to [number] named people.
- Security & Compliance hub roles are granted in the hub with a reason; nobody can grant a hub role to themselves.

### 2.2 Authentication

- MFA is mandatory for the admin portal, Supabase dashboard, Vercel, GitHub, Expo and all payment provider dashboards.
- Shared accounts are not allowed. Where a provider only offers one account, record it in the exceptions register and keep credentials in the company password manager.
- Passwords: at least 12 characters, unique per system, stored only in the approved password manager.

### 2.3 Privileged access

- Production database access with the service role is limited to server code and [named people] for break-glass use. Break-glass use is logged and reviewed.
- Privileged accounts are reviewed quarterly.

### 2.4 Changes and removal

- Access is updated within [5] working days of a role change.
- Access is removed within **1 working day** of someone leaving (immediately for dismissals). Record the time in the hub's personnel events.

### 2.5 Reviews

- All admin portal users and hub roles are reviewed **quarterly** in the hub. Reviewers can't decide on their own access.
- Revoke or modify decisions become findings and are tracked until the change is made.

### 2.6 Application access

- Customer and provider data is protected by server-side authorisation and Postgres row-level security.
- Service-role keys are only used in server code, never in the apps.

## 3. Review

Reviewed annually by the security lead.
