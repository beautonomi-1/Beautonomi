# Generate a new Android upload keystore and PEM for Google Play "Request upload key reset" (Beautonomi Partner).
# Run from repo root or apps/provider. Uses keytool (Java JDK) if available; otherwise OpenSSL (e.g. from Git for Windows).
# Output: apps/provider/upload_certificate.pem (upload to Google), keystore (.jks or .p12), upload-keystore-credentials.txt

$ErrorActionPreference = "Stop"
$ProviderDir = $PSScriptRoot + "\.."
$PemPath = Join-Path $ProviderDir "upload_certificate.pem"
$CredsPath = Join-Path $ProviderDir "upload-keystore-credentials.txt"
$Alias = "upload"

# Random password (alphanumeric, 24 chars)
Add-Type -AssemblyName System.Web
$password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })

Set-Location $ProviderDir

# Find keytool (Java)
$keytool = $null
if ($env:JAVA_HOME) {
    $kt = Join-Path $env:JAVA_HOME "bin\keytool.exe"
    if (Test-Path $kt) { $keytool = $kt }
}
if (-not $keytool) {
    $cmd = Get-Command keytool -ErrorAction SilentlyContinue
    if ($cmd) { $keytool = $cmd.Source }
}

if ($keytool) {
    $KeyStorePath = Join-Path $ProviderDir "upload-keystore.jks"
    & $keytool -genkeypair -v -storetype PKCS12 `
        -keystore $KeyStorePath `
        -alias $Alias `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $password -keypass $password `
        -dname "CN=Beautonomi Partner, OU=Mobile, O=Beautonomi, L=Johannesburg, ST=Gauteng, C=ZA"
    if ($LASTEXITCODE -ne 0) { throw "keytool -genkeypair failed" }
    & $keytool -export -rfc -keystore $KeyStorePath -alias $Alias -file $PemPath -storepass $password
    if ($LASTEXITCODE -ne 0) { throw "keytool -export failed" }
    $KeystoreFile = "upload-keystore.jks"
    $KeystoreType = "JKS"
} else {
    $openssl = $null
    if (Test-Path "C:\Program Files\Git\usr\bin\openssl.exe") { $openssl = "C:\Program Files\Git\usr\bin\openssl.exe" }
    if (-not $openssl) { $oc = Get-Command openssl -ErrorAction SilentlyContinue; if ($oc) { $openssl = $oc.Source } }
    if (-not $openssl) {
        Write-Error "Neither keytool (Java JDK) nor openssl found. Install Java JDK (https://adoptium.net) or ensure Git for Windows is installed (includes openssl)."
    }
    $KeyPath = Join-Path $ProviderDir "upload_key.pem"
    $KeyStorePath = Join-Path $ProviderDir "upload-keystore.p12"
    & $openssl genrsa -out $KeyPath 2048
    if ($LASTEXITCODE -ne 0) { throw "openssl genrsa failed" }
    & $openssl req -new -x509 -key $KeyPath -out $PemPath -days 10000 -subj "/CN=Beautonomi Partner/OU=Mobile/O=Beautonomi/L=Johannesburg/ST=Gauteng/C=ZA"
    if ($LASTEXITCODE -ne 0) { throw "openssl req failed" }
    $passout = "pass:" + $password
    & $openssl pkcs12 -export -in $PemPath -inkey $KeyPath -out $KeyStorePath -passout $passout -name $Alias
    if ($LASTEXITCODE -ne 0) { throw "openssl pkcs12 failed" }
    Remove-Item $KeyPath -Force -ErrorAction SilentlyContinue
    $KeystoreFile = "upload-keystore.p12"
    $KeystoreType = "PKCS12"
}

@"
Upload keystore credentials for EAS (Beautonomi Partner provider app).
Keep this file secret and do not commit it (it is gitignored).

Keystore path (from apps/provider): $KeystoreFile
Keystore type: $KeystoreType
Alias: $Alias
Keystore password: $password
Key password: $password

Use with EAS: eas credentials --platform android
Then choose "Use existing keystore" and point to $KeystoreFile with the above password.
"@ | Set-Content $CredsPath -Encoding UTF8

Write-Host "Done."
Write-Host "  Certificate (upload to Google): $PemPath"
Write-Host "  Keystore: $KeyStorePath"
Write-Host "  Credentials saved to: $CredsPath"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. In Play Console (Beautonomi Partner) -> App signing -> Request upload key reset"
Write-Host "  2. Upload this file: $PemPath"
Write-Host "  3. After Google approves, run: cd apps/provider; eas credentials --platform android"
Write-Host "     and choose 'Use existing keystore' -> $KeystoreFile with the password from $CredsPath"
