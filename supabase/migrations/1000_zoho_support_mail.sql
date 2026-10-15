-- Zoho Mail support inbox: connections, mailboxes, ingest audit, ticket email channel.

-- ── Zoho connection (one Zoho account / data center) ────────────────────────
CREATE TABLE IF NOT EXISTS public.support_zoho_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_center TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auth_status TEXT NOT NULL DEFAULT 'ok' CHECK (auth_status IN ('ok', 'revoked')),
  poll_page_cap INT NOT NULL DEFAULT 3 CHECK (poll_page_cap >= 1 AND poll_page_cap <= 5),
  max_messages_per_run INT NOT NULL DEFAULT 25 CHECK (max_messages_per_run >= 1 AND max_messages_per_run <= 100),
  html_retention_days INT NOT NULL DEFAULT 90 CHECK (html_retention_days >= 1 AND html_retention_days <= 365),
  client_id TEXT,
  client_secret TEXT,
  refresh_token TEXT,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  zoho_account_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_zoho_connections_enabled
  ON public.support_zoho_connections (enabled) WHERE enabled = true;

ALTER TABLE public.support_zoho_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_zoho_connections_superadmin
  ON public.support_zoho_connections FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

CREATE TRIGGER update_support_zoho_connections_updated_at
  BEFORE UPDATE ON public.support_zoho_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Mailbox (address bound to a tenant region) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.support_zoho_connections (id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  inbound_enabled BOOLEAN NOT NULL DEFAULT false,
  outbound_enabled BOOLEAN NOT NULL DEFAULT false,
  ack_enabled BOOLEAN NOT NULL DEFAULT true,
  ack_subject TEXT,
  ack_body TEXT,
  default_category TEXT,
  lookback_hours INT NOT NULL DEFAULT 0 CHECK (lookback_hours >= 0 AND lookback_hours <= 168),
  inbox_folder_id TEXT,
  blocked_senders TEXT[] NOT NULL DEFAULT '{}'::text[],
  webhook_token TEXT,
  last_sync_at TIMESTAMPTZ,
  last_run_imported INT NOT NULL DEFAULT 0,
  last_run_appended INT NOT NULL DEFAULT 0,
  last_run_skipped INT NOT NULL DEFAULT 0,
  last_run_failed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_mailboxes_address_unique UNIQUE (address)
);

CREATE INDEX IF NOT EXISTS idx_support_mailboxes_connection ON public.support_mailboxes (connection_id);
CREATE INDEX IF NOT EXISTS idx_support_mailboxes_tenant ON public.support_mailboxes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_mailboxes_inbound
  ON public.support_mailboxes (connection_id) WHERE inbound_enabled = true;

ALTER TABLE public.support_mailboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_mailboxes_superadmin
  ON public.support_mailboxes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

CREATE TRIGGER update_support_mailboxes_updated_at
  BEFORE UPDATE ON public.support_mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Folder cursor (shared Inbox per connection) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_mail_folder_cursors (
  connection_id UUID NOT NULL REFERENCES public.support_zoho_connections (id) ON DELETE CASCADE,
  folder_id TEXT NOT NULL,
  last_received_time_ms BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (connection_id, folder_id)
);

ALTER TABLE public.support_mail_folder_cursors ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_mail_folder_cursors_superadmin
  ON public.support_mail_folder_cursors FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

-- ── Acknowledgement rate limit ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_mail_ack_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID NOT NULL REFERENCES public.support_mailboxes (id) ON DELETE CASCADE,
  sender_address TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_mail_ack_log_mailbox_sender
  ON public.support_mail_ack_log (mailbox_id, lower(sender_address), sent_at DESC);

ALTER TABLE public.support_mail_ack_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_mail_ack_log_superadmin
  ON public.support_mail_ack_log FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

-- ── support_tickets: tenant + email channel ─────────────────────────────────
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS requester_email TEXT,
  ADD COLUMN IF NOT EXISTS zoho_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS mailbox_id UUID REFERENCES public.support_mailboxes (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_channel_check'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_channel_check CHECK (channel IN ('app', 'email'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_status
  ON public.support_tickets (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_requester_email_lower
  ON public.support_tickets (lower(requester_email));
CREATE INDEX IF NOT EXISTS idx_support_tickets_zoho_thread
  ON public.support_tickets (zoho_thread_id) WHERE zoho_thread_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.support_tickets_set_tenant_id_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_za UUID;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.provider_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant FROM public.providers p WHERE p.id = NEW.provider_id;
    IF v_tenant IS NOT NULL THEN
      NEW.tenant_id := v_tenant;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT u.preferred_home_tenant_id INTO v_tenant FROM public.users u WHERE u.id = NEW.user_id;
    IF v_tenant IS NOT NULL THEN
      NEW.tenant_id := v_tenant;
      RETURN NEW;
    END IF;
  END IF;

  SELECT t.id INTO v_za FROM public.tenants t WHERE t.slug = 'za' LIMIT 1;
  NEW.tenant_id := v_za;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_tickets_set_tenant_id ON public.support_tickets;
CREATE TRIGGER support_tickets_set_tenant_id
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.support_tickets_set_tenant_id_before_insert();

-- Backfill tenant_id on existing tickets
UPDATE public.support_tickets st
SET tenant_id = COALESCE(
  (SELECT p.tenant_id FROM public.providers p WHERE p.id = st.provider_id),
  (SELECT u.preferred_home_tenant_id FROM public.users u WHERE u.id = st.user_id),
  (SELECT t.id FROM public.tenants t WHERE t.slug = 'za' LIMIT 1)
)
WHERE st.tenant_id IS NULL;

-- ── Mail message audit / quarantine ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_mail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID NOT NULL REFERENCES public.support_mailboxes (id) ON DELETE CASCADE,
  zoho_message_id TEXT NOT NULL,
  zoho_thread_id TEXT,
  zoho_folder_id TEXT,
  rfc_message_id TEXT,
  ticket_id UUID REFERENCES public.support_tickets (id) ON DELETE SET NULL,
  support_ticket_message_id UUID REFERENCES public.support_ticket_messages (id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_address TEXT,
  to_address TEXT,
  cc_address TEXT,
  subject TEXT,
  body_html TEXT,
  received_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  skip_reason TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  delivery_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_mail_messages_zoho_message_id_unique UNIQUE (zoho_message_id)
);

CREATE INDEX IF NOT EXISTS idx_support_mail_messages_mailbox ON public.support_mail_messages (mailbox_id);
CREATE INDEX IF NOT EXISTS idx_support_mail_messages_ticket ON public.support_mail_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_mail_messages_rfc ON public.support_mail_messages (rfc_message_id)
  WHERE rfc_message_id IS NOT NULL;

ALTER TABLE public.support_mail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_mail_messages_superadmin
  ON public.support_mail_messages FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

CREATE TRIGGER update_support_mail_messages_updated_at
  BEFORE UPDATE ON public.support_mail_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS email_delivery_status TEXT,
  ADD COLUMN IF NOT EXISTS is_auto_reply BOOLEAN NOT NULL DEFAULT false;

-- ── Extend support_agent tenant scoping (ticket.tenant_id) ───────────────────
DROP POLICY IF EXISTS support_tickets_select_scoped ON public.support_tickets;

CREATE POLICY support_tickets_select_scoped
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'support_agent'
      )
      AND EXISTS (
        SELECT 1
        FROM public.user_tenant_roles utr
        WHERE utr.user_id = auth.uid()
          AND utr.is_active = true
          AND (
            support_tickets.tenant_id = utr.tenant_id
            OR EXISTS (
              SELECT 1
              FROM public.providers p
              WHERE p.tenant_id = utr.tenant_id
                AND support_tickets.provider_id = p.id
            )
            OR support_tickets.user_id IN (
              SELECT u2.id FROM public.users u2
              WHERE u2.preferred_home_tenant_id = utr.tenant_id
            )
          )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.support_agent_can_access_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_tickets st
    WHERE st.id = p_ticket_id
      AND (
        st.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'superadmin'
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'support_agent'
          )
          AND EXISTS (
            SELECT 1
            FROM public.user_tenant_roles utr
            WHERE utr.user_id = auth.uid()
              AND utr.is_active = true
              AND (
                st.tenant_id = utr.tenant_id
                OR EXISTS (
                  SELECT 1 FROM public.providers p
                  WHERE p.tenant_id = utr.tenant_id AND st.provider_id = p.id
                )
                OR st.user_id IN (
                  SELECT u2.id FROM public.users u2
                  WHERE u2.preferred_home_tenant_id = utr.tenant_id
                )
              )
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.support_agent_can_access_ticket(uuid) IS
  'Tenant scoping for support_agent: tenant_id on ticket, provider tenant, or user home tenant.';
