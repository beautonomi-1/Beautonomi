-- Beautonomi Database Migration
-- 007_messaging.sql
-- Creates messaging-related tables

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL, -- Null for support conversations
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_preview TEXT,
    last_message_sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    unread_count_customer INTEGER DEFAULT 0,
    unread_count_provider INTEGER DEFAULT 0,
    is_archived_customer BOOLEAN DEFAULT false,
    is_archived_provider BOOLEAN DEFAULT false,
    is_starred_customer BOOLEAN DEFAULT false,
    is_starred_provider BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(booking_id, customer_id, provider_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_role user_role NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    attachments JSONB DEFAULT '[]', -- Array of {type, url, name, size}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message templates (for providers)
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_booking ON conversations(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_provider ON conversations(provider_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_unread ON conversations(customer_id, unread_count_customer) WHERE unread_count_customer > 0;
CREATE INDEX IF NOT EXISTS idx_conversations_provider_unread ON conversations(provider_id, unread_count_provider) WHERE unread_count_provider > 0;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_message_templates_provider ON message_templates(provider_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_active ON message_templates(provider_id, is_active) WHERE is_active = true;

-- Create triggers for updated_at
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON message_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update conversation last message
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
            WHEN NEW.sender_role IN ('provider_owner', 'provider_staff') THEN unread_count_provider + 1
            ELSE unread_count_provider
        END
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation when message is created
CREATE TRIGGER on_message_created
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION mark_conversation_messages_read(
    p_conversation_id UUID,
    p_user_id UUID
)
RETURNS void AS $$
DECLARE
    v_user_role user_role;
BEGIN
    -- Get user role
    SELECT role INTO v_user_role FROM users WHERE id = p_user_id;
    
    -- Mark messages as read
    UPDATE messages
    SET is_read = true, read_at = NOW()
    WHERE conversation_id = p_conversation_id
    AND sender_id != p_user_id
    AND is_read = false;
    
    -- Update conversation unread counts
    IF v_user_role = 'customer' THEN
        UPDATE conversations
        SET unread_count_customer = 0
        WHERE id = p_conversation_id;
    ELSIF v_user_role IN ('provider_owner', 'provider_staff') THEN
        UPDATE conversations
        SET unread_count_provider = 0
        WHERE id = p_conversation_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Users can view own conversations"
    ON conversations FOR SELECT
    USING (
        customer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = conversations.provider_id
            AND (providers.user_id = auth.uid() OR
                 EXISTS (
                     SELECT 1 FROM provider_staff
                     WHERE provider_staff.provider_id = providers.id
                     AND provider_staff.user_id = auth.uid()
                 ))
        )
    );

CREATE POLICY "Users can create conversations"
    ON conversations FOR INSERT
    WITH CHECK (
        customer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = conversations.provider_id
            AND providers.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own conversations"
    ON conversations FOR UPDATE
    USING (
        customer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = conversations.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- RLS Policies for messages
CREATE POLICY "Users can view messages in accessible conversations"
    ON messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND (
                conversations.customer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = conversations.provider_id
                    AND (providers.user_id = auth.uid() OR
                         EXISTS (
                             SELECT 1 FROM provider_staff
                             WHERE provider_staff.provider_id = providers.id
                             AND provider_staff.user_id = auth.uid()
                         ))
                )
            )
        )
    );

CREATE POLICY "Users can create messages in accessible conversations"
    ON messages FOR INSERT
    WITH CHECK (
        sender_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND (
                conversations.customer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM providers
                    WHERE providers.id = conversations.provider_id
                    AND (providers.user_id = auth.uid() OR
                         EXISTS (
                             SELECT 1 FROM provider_staff
                             WHERE provider_staff.provider_id = providers.id
                             AND provider_staff.user_id = auth.uid()
                         ))
                )
            )
        )
    );

CREATE POLICY "Users can update own messages"
    ON messages FOR UPDATE
    USING (sender_id = auth.uid());

-- RLS Policies for message_templates
CREATE POLICY "Providers can manage own message templates"
    ON message_templates FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = message_templates.provider_id
            AND providers.user_id = auth.uid()
        )
    );
