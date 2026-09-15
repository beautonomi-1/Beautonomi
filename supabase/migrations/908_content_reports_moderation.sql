-- Migration 908: Moderation escalation states and illegal/exploitative report reason.

ALTER TABLE public.content_reports
  DROP CONSTRAINT IF EXISTS content_reports_reason_check;

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_reason_check CHECK (
    reason IN (
      'inappropriate', 'misleading', 'harassment', 'spam', 'safety', 'other',
      'illegal_exploitative'
    )
  );

ALTER TABLE public.content_reports
  DROP CONSTRAINT IF EXISTS content_reports_status_check;

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_status_check CHECK (
    status IN ('pending', 'resolved', 'dismissed', 'escalated', 'legal_hold')
  );

COMMENT ON COLUMN public.content_reports.status IS
  'escalated/legal_hold are human-only states for illegal-content suspicion; agents never auto-resolve.';
