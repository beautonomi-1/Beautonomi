-- Beautonomi Database Migration
-- 011_storage_policies.sql
-- Creates storage buckets and policies

-- Note: Storage buckets are created via Supabase Dashboard or CLI
-- This file documents the bucket structure and policies

-- Storage buckets to create:
-- 1. avatars - User and provider profile images
-- 2. provider-gallery - Provider business photos
-- 3. service-images - Service offering images
-- 4. booking-documents - Booking-related documents
-- 5. verification-documents - ID verification documents
-- 6. receipts - Payment receipts and invoices

-- Storage policies are managed via Supabase Dashboard or using the storage API
-- Below are example policies that should be configured:

-- AVATARS BUCKET POLICIES
-- Policy: Users can upload own avatar
-- INSERT: auth.uid() = (storage.foldername(name))[1]::uuid
-- SELECT: true (public read)
-- UPDATE: auth.uid() = (storage.foldername(name))[1]::uuid
-- DELETE: auth.uid() = (storage.foldername(name))[1]::uuid OR role = 'superadmin'

-- PROVIDER-GALLERY BUCKET POLICIES
-- Policy: Providers can upload to own gallery
-- INSERT: EXISTS (SELECT 1 FROM providers WHERE user_id = auth.uid() AND id::text = (storage.foldername(name))[1])
-- SELECT: true (public read for active providers)
-- UPDATE: EXISTS (SELECT 1 FROM providers WHERE user_id = auth.uid() AND id::text = (storage.foldername(name))[1])
-- DELETE: EXISTS (SELECT 1 FROM providers WHERE user_id = auth.uid() AND id::text = (storage.foldername(name))[1]) OR role = 'superadmin'

-- SERVICE-IMAGES BUCKET POLICIES
-- Policy: Providers can upload service images
-- INSERT: EXISTS (SELECT 1 FROM offerings o JOIN providers p ON p.id = o.provider_id WHERE p.user_id = auth.uid() AND o.id::text = (storage.foldername(name))[1])
-- SELECT: true (public read for active services)
-- UPDATE: EXISTS (SELECT 1 FROM offerings o JOIN providers p ON p.id = o.provider_id WHERE p.user_id = auth.uid() AND o.id::text = (storage.foldername(name))[1])
-- DELETE: EXISTS (SELECT 1 FROM offerings o JOIN providers p ON p.id = o.provider_id WHERE p.user_id = auth.uid() AND o.id::text = (storage.foldername(name))[1]) OR role = 'superadmin'

-- BOOKING-DOCUMENTS BUCKET POLICIES
-- Policy: Users can upload documents for own bookings
-- INSERT: EXISTS (SELECT 1 FROM bookings WHERE id::text = (storage.foldername(name))[1] AND (customer_id = auth.uid() OR EXISTS (SELECT 1 FROM providers WHERE id = provider_id AND user_id = auth.uid())))
-- SELECT: EXISTS (SELECT 1 FROM bookings WHERE id::text = (storage.foldername(name))[1] AND (customer_id = auth.uid() OR EXISTS (SELECT 1 FROM providers WHERE id = provider_id AND user_id = auth.uid())))
-- UPDATE: Same as INSERT
-- DELETE: Same as INSERT OR role = 'superadmin'

-- VERIFICATION-DOCUMENTS BUCKET POLICIES
-- Policy: Users can upload own verification documents
-- INSERT: auth.uid() = (storage.foldername(name))[1]::uuid
-- SELECT: auth.uid() = (storage.foldername(name))[1]::uuid OR role = 'superadmin'
-- UPDATE: auth.uid() = (storage.foldername(name))[1]::uuid OR role = 'superadmin'
-- DELETE: auth.uid() = (storage.foldername(name))[1]::uuid OR role = 'superadmin'

-- RECEIPTS BUCKET POLICIES
-- Policy: Users can view receipts for own payments
-- INSERT: role = 'superadmin' (only admins can upload receipts)
-- SELECT: EXISTS (SELECT 1 FROM payments WHERE id::text = (storage.foldername(name))[1] AND user_id = auth.uid()) OR role = 'superadmin'
-- UPDATE: role = 'superadmin'
-- DELETE: role = 'superadmin'

-- Note: Actual bucket creation and policy setup should be done via:
-- 1. Supabase Dashboard: Storage > Create Bucket
-- 2. Supabase CLI: supabase storage create <bucket-name>
-- 3. Policy creation via Dashboard or SQL using storage.policies table
