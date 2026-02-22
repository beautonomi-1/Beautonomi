# Supabase Migrations

This directory contains database migrations for the Beautonomi platform.

## Migration Order

Run migrations in this exact order:

1. `001_initial_schema.sql` - Base setup
2. `002_users_and_auth.sql` - User authentication
3. `003_providers.sql` - Provider system
4. `004_services.sql` - Service catalog
5. `005_bookings.sql` - Booking system
6. `006_payments.sql` - Payment processing
7. `007_messaging.sql` - Messaging system
8. `008_reviews.sql` - Reviews and ratings
9. `009_content.sql` - CMS content
10. `010_platform.sql` - Platform features
11. `011_storage_policies.sql` - Storage setup (documentation)
12. `012_functions_and_triggers.sql` - Database functions

## Quick Start

1. Set up your Supabase project
2. Run migrations via Dashboard or CLI
3. Create storage buckets
4. Generate TypeScript types
5. Update environment variables

See [SUPABASE_MIGRATION.md](../docs/SUPABASE_MIGRATION.md) for detailed instructions.

## Manual Storage Bucket Creation

Some buckets are not created by migrations and must be created manually in the Supabase Dashboard (Storage > New bucket):

- **explore-posts**: Required for the Explore feature. Create as a **public** bucket so media URLs work. Path format: `explore/{provider_id}/{filename}`. Policies are applied by migration `222_explore_storage_policies.sql`.
