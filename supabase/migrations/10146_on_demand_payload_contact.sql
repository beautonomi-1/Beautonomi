-- Staff (and realtime) can SELECT on_demand_requests. Customer email and phone
-- belong on users, keyed by customer_id. Clear the copies inside the stored draft.

UPDATE public.on_demand_requests
SET request_payload = jsonb_set(
  jsonb_set(
    request_payload,
    '{client_info,email}',
    'null'::jsonb,
    true
  ),
  '{client_info,phone}',
  'null'::jsonb,
  true
)
WHERE jsonb_typeof(request_payload->'client_info') = 'object';

UPDATE public.on_demand_requests
SET request_payload = request_payload
  || CASE WHEN request_payload ? 'email' THEN '{"email":null}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN request_payload ? 'phone' THEN '{"phone":null}'::jsonb ELSE '{}'::jsonb END
WHERE request_payload ? 'email'
   OR request_payload ? 'phone';
