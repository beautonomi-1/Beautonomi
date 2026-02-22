# Supabase Database

This directory contains the Supabase database schema and migrations for the Beautonomi platform.

## Directory Structure

```
supabase/
├── migrations/     # SQL migration files (numbered sequentially)
├── config.toml     # Supabase CLI configuration (if present)
└── seed.sql        # Seed data (if present)
```

## Running Migrations

Migrations are applied via the Supabase dashboard or CLI:

```bash
# Link to your project
npx supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
npx supabase db push

# Create a new migration
npx supabase migration new my_migration_name
```

## Migration Naming Convention

Migrations are numbered sequentially: `001_initial_schema.sql`, `002_users_and_auth.sql`, etc.

> **Note**: The legacy `beautonomi/supabase/` directory contains the original copies. This root-level directory is the canonical source going forward.
