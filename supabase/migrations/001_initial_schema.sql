-- Beautonomi Database Migration
-- 001_initial_schema.sql
-- Creates base enums and extensions

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For geographic queries (if needed)

-- Create custom enums
CREATE TYPE user_role AS ENUM ('customer', 'provider_owner', 'provider_staff', 'superadmin');
CREATE TYPE business_type AS ENUM ('freelancer', 'salon');
CREATE TYPE provider_status AS ENUM ('draft', 'pending_approval', 'active', 'suspended');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE location_type AS ENUM ('at_home', 'at_salon');
CREATE TYPE service_type AS ENUM ('master_service', 'offering');
CREATE TYPE notification_type AS ENUM ('booking_confirmation', 'booking_reminder', 'booking_cancelled', 'payment_received', 'review_request', 'message', 'system');
CREATE TYPE promotion_type AS ENUM ('percentage', 'fixed');

-- Helper function for updating updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
