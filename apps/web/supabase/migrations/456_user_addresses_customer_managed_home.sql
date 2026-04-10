-- When true, the default saved address was set/updated by the customer via /api/me/*.
-- Provider portal must not overwrite it (house-call coords stay customer-controlled).

ALTER TABLE user_addresses
ADD COLUMN IF NOT EXISTS customer_managed_home BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_addresses.customer_managed_home IS
  'True if the customer established or last edited this row via customer app/web profile or /api/me/addresses. Provider client APIs must refuse to replace the default home address while this is true.';
