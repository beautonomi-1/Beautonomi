-- Enforce call-log dedupe at the DB level.
-- Twilio CallSid and Salestrail callId are globally unique, so duplicate rows
-- for channel 'call' with the same external_message_id are always webhook
-- retries / races — reject them with a partial unique index. Webhooks treat
-- unique violations (23505) as an already-logged call.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_provider_lead_comms_call_external_id
  ON provider_lead_communications(external_message_id)
  WHERE external_message_id IS NOT NULL AND channel = 'call';
