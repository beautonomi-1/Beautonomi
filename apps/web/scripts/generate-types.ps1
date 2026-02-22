# Generate TypeScript types from Supabase schema (PowerShell)
# Usage: .\scripts\generate-types.ps1 [project-id]

param(
    [string]$ProjectId = $env:SUPABASE_PROJECT_ID
)

if ([string]::IsNullOrEmpty($ProjectId)) {
    Write-Host "Error: Project ID required" -ForegroundColor Red
    Write-Host "Usage: .\scripts\generate-types.ps1 [project-id]"
    Write-Host "Or set SUPABASE_PROJECT_ID environment variable"
    exit 1
}

Write-Host "Generating TypeScript types for project: $ProjectId" -ForegroundColor Green

npx supabase gen types typescript --project-id $ProjectId | Out-File -FilePath "src/lib/supabase/database.types.ts" -Encoding utf8

Write-Host "Types generated successfully at src/lib/supabase/database.types.ts" -ForegroundColor Green
