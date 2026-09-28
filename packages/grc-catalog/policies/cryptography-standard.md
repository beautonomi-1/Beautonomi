# Cryptography Standard

## 1. In transit

- TLS 1.2 or higher for all external traffic; HSTS with preload on the web domain.
- Supabase and third-party APIs are called over HTTPS only.

## 2. At rest

- Database, storage and backups are encrypted by the hosting provider (Supabase / its cloud provider).
- Sensitive fields that need extra protection are encrypted in the application with AES-256-GCM (`apps/web/src/lib/security/field-encryption.ts`).

## 3. Integrity

- SHA-256 hashes identify evidence files and audit pack contents; the GRC activity log is hash-chained with SHA-256.
- Payment webhooks are verified with the provider's HMAC signature.

## 4. Keys and secrets

- Stored only in Vercel / EAS environment settings or the approved password manager.
- Access limited to people who deploy.
- Rotate immediately if exposed, when a person with access leaves, and at least [yearly] for high-value keys (Supabase service role, payment secret keys, field encryption key).
- Keep a key inventory: purpose, location, owner, last rotation.

## 5. Prohibited

MD5 or SHA-1 for security purposes; home-made cryptography; secrets in source code or mobile app bundles.
