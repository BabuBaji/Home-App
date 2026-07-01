# Builds the HomeHelp Android debug APK.
# Auto-detects your current Wi-Fi LAN IP, points the app at <ip>:4000, and assembles the APK.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# Toolchain — auto-detect so this works on any dev machine.
# Respects an already-set JAVA_HOME / ANDROID_HOME; otherwise probes common locations.
if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
  $jdk = @(
    'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot',
    "$env:USERPROFILE\Android\jdk\jdk-17.0.19+10",
    'C:\Program Files\Android\Android Studio\jbr'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $jdk) { $jdk = (Get-ChildItem 'C:\Program Files\Eclipse Adoptium\jdk-17*' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
  if (-not $jdk) { throw 'Could not find a JDK 17. Set $env:JAVA_HOME and retry.' }
  $env:JAVA_HOME = $jdk
}
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
  $sdk = @(
    "$env:LOCALAPPDATA\Android\Sdk",
    "$env:USERPROFILE\Android\Sdk",
    'C:\Android\Sdk'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $sdk) { throw 'Could not find the Android SDK. Set $env:ANDROID_HOME and retry.' }
  $env:ANDROID_HOME = $sdk
}
Write-Host "JAVA_HOME    -> $env:JAVA_HOME" -ForegroundColor DarkGray
Write-Host "ANDROID_HOME -> $env:ANDROID_HOME" -ForegroundColor DarkGray

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
