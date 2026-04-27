-- One DM thread per (customer, provider). Merge historical duplicates (multiple
-- rows per pair from booking-scoped creation or multiple booking_id = NULL
-- under PostgreSQL’s UNIQUE NULL behavior), then replace the old triple unique
-- with a pair unique.

-- 1) Move messages and drop duplicate conversation rows
DO $$
DECLARE
  grp RECORD;
  canon_id uuid;
  ids uuid[];
  i int;
  dup_id uuid;
BEGIN
  FOR grp IN
    SELECT
      customer_id,
      provider_id,
      array_agg(id ORDER BY last_message_at DESC NULLS LAST, created_at ASC) AS c_ids
    FROM conversations
    GROUP BY customer_id, provider_id
    HAVING count(*) > 1
  LOOP
    ids := grp.c_ids;
    canon_id := ids[1];
    FOR i IN 2..coalesce(array_length(ids, 1), 0) LOOP
      dup_id := ids[i];
      UPDATE messages SET conversation_id = canon_id WHERE conversation_id = dup_id;
      DELETE FROM conversations WHERE id = dup_id;
    END LOOP;

    -- Recompute denormalized fields for the surviving row from messages
    UPDATE conversations c
    SET
      last_message_at = COALESCE(
        (SELECT max(m.created_at) FROM messages m WHERE m.conversation_id = c.id),
        c.last_message_at
      ),
      last_message_preview = COALESCE(
        (SELECT left(m2.content, 100)
         FROM messages m2
         WHERE m2.conversation_id = c.id
         ORDER BY m2.created_at DESC NULLS LAST
         LIMIT 1),
        c.last_message_preview
      ),
      last_message_sender_id = (
        SELECT m3.sender_id
        FROM messages m3
        WHERE m3.conversation_id = c.id
        ORDER BY m3.created_at DESC NULLS LAST
        LIMIT 1
      ),
      unread_count_customer = COALESCE((
        SELECT count(*)::integer
        FROM messages m4
        WHERE m4.conversation_id = c.id
          AND m4.is_read = false
          AND m4.sender_role IS DISTINCT FROM 'customer'::user_role
      ), 0),
      unread_count_provider = COALESCE((
        SELECT count(*)::integer
        FROM messages m5
        WHERE m5.conversation_id = c.id
          AND m5.is_read = false
          AND m5.sender_role = 'customer'::user_role
      ), 0)
    WHERE c.id = canon_id;
  END LOOP;
END $$;

-- 2) Replace unique constraint: (booking_id, customer_id, provider_id) -> (customer_id, provider_id)
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_booking_id_customer_id_provider_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_customer_provider_uidx
  ON conversations (customer_id, provider_id);
