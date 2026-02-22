# Check Supabase Connection and Generate Types
# This script checks .env.local and generates TypeScript types

param(
    [string]$ProjectId = $null
)

Write-Host "=== Supabase Connection Check & Type Generation ===" -ForegroundColor Cyan
Write-Host ""

# Check for .env.local
$envPath = Join-Path $PSScriptRoot "..\.env.local"
if (-not (Test-Path $envPath)) {
    $envPath = Join-Path $PSScriptRoot "..\..\.env.local"
}

if (Test-Path $envPath) {
    Write-Host "✓ Found .env.local" -ForegroundColor Green
    $envContent = Get-Content $envPath
    
    # Extract project ID from URL
    $urlLine = $envContent | Where-Object { $_ -match "NEXT_PUBLIC_SUPABASE_URL" }
    if ($urlLine) {
        $urlMatch = [regex]::Match($urlLine, "https://([^.]+)\.supabase\.co")
        if ($urlMatch.Success) {
            $extractedProjectId = $urlMatch.Groups[1].Value
            Write-Host "✓ Project ID extracted: $extractedProjectId" -ForegroundColor Green
        
            if (-not $ProjectId) {
                $ProjectId = $extractedProjectId
            }
        } else {
            Write-Host "⚠ Could not extract project ID from URL" -ForegroundColor Yellow
        }
    }
    
    # Check for required variables
    $hasUrl = $envContent | Where-Object { $_ -match "NEXT_PUBLIC_SUPABASE_URL" -and $_ -notmatch "^#" }
    $hasAnonKey = $envContent | Where-Object { $_ -match "NEXT_PUBLIC_SUPABASE_ANON_KEY" -and $_ -notmatch "^#" }
    $hasServiceKey = $envContent | Where-Object { $_ -match "SUPABASE_SERVICE_ROLE_KEY" -and $_ -notmatch "^#" }
    
    Write-Host ""
    Write-Host "Environment Variables:" -ForegroundColor Cyan
    if ($hasUrl) { Write-Host "  ✓ NEXT_PUBLIC_SUPABASE_URL" -ForegroundColor Green } else { Write-Host "  ✗ NEXT_PUBLIC_SUPABASE_URL (missing)" -ForegroundColor Red }
    if ($hasAnonKey) { Write-Host "  ✓ NEXT_PUBLIC_SUPABASE_ANON_KEY" -ForegroundColor Green } else { Write-Host "  ✗ NEXT_PUBLIC_SUPABASE_ANON_KEY (missing)" -ForegroundColor Red }
    if ($hasServiceKey) { Write-Host "  ✓ SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Green } else { Write-Host "  ⚠ SUPABASE_SERVICE_ROLE_KEY (optional for type generation)" -ForegroundColor Yellow }
} else {
    Write-Host "✗ .env.local not found" -ForegroundColor Red
    Write-Host "  Please create .env.local with your Supabase credentials" -ForegroundColor Yellow
}

Write-Host ""

# Generate types if project ID is available
if ($ProjectId) {
    Write-Host "=== Generating TypeScript Types ===" -ForegroundColor Cyan
    Write-Host "Project ID: $ProjectId" -ForegroundColor Cyan
    Write-Host ""
    
    $typesPath = Join-Path $PSScriptRoot "..\src\lib\supabase\database.types.ts"
    $typesPath = Resolve-Path $typesPath -ErrorAction SilentlyContinue
    
    if (-not $typesPath) {
        $typesPath = Join-Path $PSScriptRoot "..\src\lib\supabase\database.types.ts"
    }
    
    Write-Host "Generating types to: $typesPath" -ForegroundColor Cyan
    Write-Host ""
    
    try {
        # Run type generation
        $output = npx supabase gen types typescript --project-id $ProjectId 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            # Save to file
            $output | Out-File -FilePath $typesPath -Encoding utf8 -NoNewline
            Write-Host "✓ Types generated successfully!" -ForegroundColor Green
            Write-Host "  File: $typesPath" -ForegroundColor Gray
            
            # Check file size
            $fileInfo = Get-Item $typesPath
            Write-Host "  Size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Gray
        } else {
            Write-Host "✗ Type generation failed" -ForegroundColor Red
            Write-Host $output -ForegroundColor Red
        }
    } catch {
        Write-Host "✗ Error generating types: $_" -ForegroundColor Red
    }
} else {
    Write-Host "⚠ Cannot generate types without Project ID" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please provide Project ID:" -ForegroundColor Cyan
    Write-Host "  Option 1: Run with parameter: .\scripts\check-and-generate-types.ps1 -ProjectId 'your-project-id'" -ForegroundColor Gray
    Write-Host "  Option 2: Extract from Supabase URL in .env.local" -ForegroundColor Gray
    Write-Host "  Option 3: Find in Supabase Dashboard > Settings > General > Reference ID" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
