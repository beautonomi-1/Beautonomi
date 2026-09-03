-- Cron execution log + overlap guard for Vercel scheduled handlers.

CREATE TABLE IF NOT EXISTS public.cron_runs (
  id bigserial PRIMARY KEY,
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  summary jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job_started
  ON public.cron_runs (job_name, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cron_runs_job_active
  ON public.cron_runs (job_name)
  WHERE status = 'running';

COMMENT ON TABLE public.cron_runs IS 'Execution log and single-flight guard for /api/cron handlers.';

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_cron_run(
  p_job_name text,
  p_stale_after_minutes integer DEFAULT 30
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id bigint;
BEGIN
  UPDATE public.cron_runs
  SET
    status = 'failed',
    finished_at = now(),
    error = 'stale lock reclaimed'
  WHERE job_name = p_job_name
    AND status = 'running'
    AND started_at < now() - make_interval(mins => GREATEST(p_stale_after_minutes, 1));

  IF EXISTS (
    SELECT 1
    FROM public.cron_runs
    WHERE job_name = p_job_name
      AND status = 'running'
  ) THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.cron_runs (job_name, status)
    VALUES (p_job_name, 'running')
    RETURNING id INTO v_run_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN NULL;
  END;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_cron_run(
  p_run_id bigint,
  p_status text,
  p_summary jsonb DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('completed', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'invalid cron run status: %', p_status;
  END IF;

  UPDATE public.cron_runs
  SET
    status = p_status,
    finished_at = now(),
    summary = p_summary,
    error = p_error
  WHERE id = p_run_id
    AND status = 'running';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cron_run(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_cron_run(bigint, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_cron_run(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_cron_run(bigint, text, jsonb, text) TO service_role;
