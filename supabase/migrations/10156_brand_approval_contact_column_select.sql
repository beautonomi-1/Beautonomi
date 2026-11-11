-- The only policy on brand_approvals allows every role to read every row.
-- A signed-in session can therefore read guest_email. Drop the table read
-- for anon and authenticated, then grant every other column. INSERT and
-- UPDATE stay, so a guest link can still store the address. The review
-- page and the approval desk keep the original table read.

REVOKE SELECT ON TABLE public.brand_approvals FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  tenant_id,
  subject_type,
  subject_id,
  version_hash,
  prev_hash,
  requested_by,
  approver_id,
  status,
  comment,
  due_at,
  decided_at,
  guest_token_hash,
  guest_token_expires_at,
  evidence,
  created_at
) ON TABLE public.brand_approvals TO anon, authenticated;
