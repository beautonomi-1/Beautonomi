# Provider iOS credentials — run the EAS command yourself (interactive; requires Apple login).
# From repo root: cd apps/provider && eas credentials --platform ios

Write-Host ""
Write-Host "Provider iOS credentials — run these from the repo root:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  cd apps/provider" -ForegroundColor White
Write-Host "  eas credentials --platform ios" -ForegroundColor White
Write-Host ""
Write-Host "Then: choose production -> Build Credentials -> complete for BOTH targets (main app + OneSignal extension)." -ForegroundColor Gray
Write-Host ""
Write-Host "See apps/provider/IOS_CREDENTIALS_SETUP.md for full steps." -ForegroundColor Gray
Write-Host ""
