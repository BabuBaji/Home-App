# Builds the HomeHelp Android debug APK.
# Auto-detects your current Wi-Fi LAN IP, points the app at <ip>:4000, and assembles the APK.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# Toolchain (adjust if your paths differ)
$env:JAVA_HOME   = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = 'C:\Users\balaj\Android\Sdk'

# 1) Detect LAN IPv4 (prefer Wi-Fi)
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Sort-Object { $_.InterfaceAlias -notlike '*Wi-Fi*' } |
  Select-Object -First 1).IPAddress
if (-not $ip) { throw 'Could not detect a LAN IP. Connect to Wi-Fi and retry.' }
Write-Host "Backend URL -> http://$ip`:4000" -ForegroundColor Cyan
"VITE_API_URL=http://$ip`:4000" | Out-File -FilePath "$root\.env.production" -Encoding ascii

# 2) Build web bundle
Push-Location $root
npm run build
if ($LASTEXITCODE) { throw 'web build failed' }

# 3) Sync to Android
npx cap sync android
if ($LASTEXITCODE) { throw 'cap sync failed' }
Pop-Location

# 4) Assemble APK
Push-Location "$root\android"
.\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE) { throw 'gradle build failed' }
Pop-Location

# 5) Copy to repo root
$apk = "$root\android\app\build\outputs\apk\debug\app-debug.apk"
$dest = "$root\..\HomeHelp-debug.apk"
Copy-Item $apk $dest -Force
$mb = [math]::Round((Get-Item $dest).Length / 1MB, 2)
Write-Host "`nAPK ready: $dest  ($mb MB)" -ForegroundColor Green
Write-Host "App points to http://$ip`:4000 - make sure the backend is running (npm run server)." -ForegroundColor Yellow
