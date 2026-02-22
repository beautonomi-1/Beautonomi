-- Beautonomi Database Migration
-- 037_fix_messaging_unread_counts.sql
-- Fix unread count logic in update_conversation_last_message() to increment the OTHER party.

CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET 
        last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.content, 100),
        last_message_sender_id = NEW.sender_id,
        unread_count_customer = CASE 
            WHEN NEW.sender_role != 'customer' THEN unread_count_customer + 1
            ELSE unread_count_customer
        END,
        unread_count_provider = CASE 
            WHEN NEW.sender_role = 'customer' THEN unread_count_provider + 1
            ELSE unread_count_provider
        END
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

