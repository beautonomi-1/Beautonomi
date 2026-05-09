-- Backfill routing for support.ticket.created / support.ticket.reply when missing,
-- using the same rule as support.ticket.high_priority_created (then urgent) so existing
-- Slack installs keep delivering standard tickets and replies without skipped_no_channel.

UPDATE slack_integration_config
SET
  routing =
    routing
    || CASE
      WHEN NOT (routing ? 'support.ticket.created')
        AND (
          routing ? 'support.ticket.high_priority_created'
          OR routing ? 'support.ticket.urgent_created'
        )
      THEN jsonb_build_object(
        'support.ticket.created',
        COALESCE(
          routing->'support.ticket.high_priority_created',
          routing->'support.ticket.urgent_created'
        )
      )
      ELSE '{}'::jsonb
    END
    || CASE
      WHEN NOT (routing ? 'support.ticket.reply')
        AND (
          routing ? 'support.ticket.high_priority_created'
          OR routing ? 'support.ticket.urgent_created'
        )
      THEN jsonb_build_object(
        'support.ticket.reply',
        COALESCE(
          routing->'support.ticket.high_priority_created',
          routing->'support.ticket.urgent_created'
        )
      )
      ELSE '{}'::jsonb
    END,
  updated_at = NOW();

COMMENT ON COLUMN slack_integration_config.routing IS
  'Per-event Slack routing. Includes support.ticket.created (standard tickets) and support.ticket.reply; '
  'API merges with defaults via mergeSlackRouting().';
