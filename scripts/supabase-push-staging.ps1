# Repair known orphan migration versions (from renames) then push to linked Supabase project.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$orphans = @(240, 285, 311, 312, 314, 329, 381, 465, 577, 806)
supabase migration repair @orphans --status reverted 2>&1 | Out-Null

$attempt = 0
while ($attempt -lt 30) {
  $attempt++
  $log = Join-Path $env:TEMP "supabase-push-attempt-$attempt.log"
  supabase db push --yes --include-all 2>&1 | Tee-Object -FilePath $log
  if ($LASTEXITCODE -eq 0) {
    Write-Host "MIGRATIONS_COMPLETE"
    exit 0
  }
  $err = Get-Content $log -Raw
  if ($err -match "Remote migration versions not found") {
    if ($err -match "reverted ([0-9 ]+)") {
      $nums = $Matches[1].Trim() -split "\s+"
      supabase migration repair @nums --status reverted 2>&1 | Out-Null
      continue
    }
  }
  if ($err -match "inserted before the last migration") {
    supabase db push --yes --include-all 2>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -eq 0) { Write-Host "MIGRATIONS_COMPLETE"; exit 0 }
    $err = Get-Content $log -Raw
  }
  if ($err -match "ERROR:") {
    Select-String -Path $log -Pattern "ERROR:" | Select-Object -Last 3
    exit 1
  }
  exit 1
}
Write-Host "Too many attempts"
exit 1
