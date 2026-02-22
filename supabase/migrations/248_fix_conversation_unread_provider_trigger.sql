-- Fix: unread_count_provider should increase when CUSTOMER sends a message,
-- not when provider sends. (Provider unread = messages from customer not yet seen by provider.)
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
