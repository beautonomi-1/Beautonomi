#!/bin/bash

# Generate TypeScript types from Supabase schema
# Usage: ./scripts/generate-types.sh [project-id]

set -e

PROJECT_ID=${1:-${SUPABASE_PROJECT_ID}}

if [ -z "$PROJECT_ID" ]; then
    echo "Error: Project ID required"
    echo "Usage: ./scripts/generate-types.sh [project-id]"
    echo "Or set SUPABASE_PROJECT_ID environment variable"
    exit 1
fi

echo "Generating TypeScript types for project: $PROJECT_ID"

npx supabase gen types typescript --project-id "$PROJECT_ID" > src/lib/supabase/database.types.ts

echo "Types generated successfully at src/lib/supabase/database.types.ts"
