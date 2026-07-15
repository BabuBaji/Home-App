# Builds the HomeHelp Android debug APK and installs it on a connected phone.
# Auto-detects the JDK 17 + Android SDK toolchain and your Wi-Fi LAN IP, points the app at
# <ip>:8080, assembles the APK, copies it to the repo root, and installs it if a phone is connected.
$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$appId = 'com.homehelp.customer'

# Return the first path in the list that exists (or $null).
function Resolve-FirstPath([string[]]$candidates) {
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

# -- Toolchain: JDK 17 (JAVA_HOME) --
$javaCandidates = @()
if ($env:JAVA_HOME) { $javaCandidates += $env:JAVA_HOME }
$adoptium = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
if ($adoptium) { $javaCandidates += $adoptium.FullName }
$javaCandidates += 'C:\Program Files\Android\Android Studio\jbr'          # Android Studio bundled JDK
$javaCandidates += 'C:\Users\Smartgrow\Android\jdk\jdk-17.0.19+10'         # original build machine
$javaCmd = Get-Command java -ErrorAction SilentlyContinue                  # ...\bin\java.exe -> JAVA_HOME
if ($javaCmd) { $javaCandidates += (Split-Path (Split-Path $javaCmd.Source -Parent) -Parent) }
$env:JAVA_HOME = Resolve-FirstPath $javaCandidates
if (-not $env:JAVA_HOME) { throw 'Could not locate a JDK 17. Install one or set $env:JAVA_HOME.' }

# -- Toolchain: Android SDK (ANDROID_HOME) --
$sdkCandidates = @()
if ($env:ANDROID_HOME)     { $sdkCandidates += $env:ANDROID_HOME }
if ($env:ANDROID_SDK_ROOT) { $sdkCandidates += $env:ANDROID_SDK_ROOT }
$sdkCandidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk')             # default Android Studio SDK
$sdkCandidates += 'C:\Users\Smartgrow\Android\Sdk'                        # original build machine
$env:ANDROID_HOME = Resolve-FirstPath $sdkCandidates
if (-not $env:ANDROID_HOME) { throw 'Could not locate the Android SDK. Install it or set $env:ANDROID_HOME.' }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

# adb lives under the SDK; fall back to PATH.
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) { $c = Get-Command adb -ErrorAction SilentlyContinue; if ($c) { $adb = $c.Source } }

Write-Host "JAVA_HOME    -> $($env:JAVA_HOME)"    -ForegroundColor DarkCyan
Write-Host "ANDROID_HOME -> $($env:ANDROID_HOME)" -ForegroundColor DarkCyan

# 1) Detect LAN IPv4 (prefer Wi-Fi) -> the URL the phone uses to reach the backend
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Sort-Object { $_.InterfaceAlias -notlike '*Wi-Fi*' } |
  Select-Object -First 1).IPAddress
if (-not $ip) { throw 'Could not detect a LAN IP. Connect to Wi-Fi and retry.' }
Write-Host "Backend URL  -> http://$ip`:8080" -ForegroundColor Cyan
"VITE_API_URL=http://$ip`:8080" | Out-File -FilePath "$root\.env.production" -Encoding ascii

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
$apk  = "$root\android\app\build\outputs\apk\debug\app-debug.apk"
$dest = "$root\..\..\HomeHelp-debug.apk"
Copy-Item $apk $dest -Force
$mb = [math]::Round((Get-Item $dest).Length / 1MB, 2)
Write-Host "`nAPK ready: $dest  ($mb MB)" -ForegroundColor Green

# 6) Install on a connected, authorized device (if any)
$installed = $false
if ($adb -and (Test-Path $adb)) {
  $ready = @(); $unauthorized = $false
  foreach ($line in (& $adb devices | Select-Object -Skip 1)) {
    if (-not $line.Trim()) { continue }
    $parts = $line -split '\s+'
    if ($parts.Count -ge 2) {
      if     ($parts[1] -eq 'device')       { $ready += $parts[0] }
      elseif ($parts[1] -eq 'unauthorized') { $unauthorized = $true }
    }
  }
  if ($ready.Count -gt 0) {
    $serial = $ready[0]
    Write-Host "Installing on $serial ..." -ForegroundColor Cyan
    & $adb -s $serial install -r $dest
    if ($LASTEXITCODE) { Write-Warning 'adb install failed - install the APK manually.' }
    else {
      $installed = $true
      Write-Host 'Installed. Launching HomeHelp...' -ForegroundColor Green
      & $adb -s $serial shell monkey -p $appId -c android.intent.category.LAUNCHER 1 | Out-Null
    }
  }
  elseif ($unauthorized) {
    Write-Warning "A phone is connected but UNAUTHORIZED. Unlock it, tap 'Allow USB debugging', then run:  adb install -r `"$dest`""
  }
  else {
    Write-Host "No phone connected. Connect one (USB debugging on) and run:  adb install -r `"$dest`"" -ForegroundColor Yellow
  }
} else {
  Write-Warning "adb not found - install the APK manually: $dest"
}

Write-Host "`nApp points to http://$ip`:8080 - keep the backend running (docker compose -f infra/docker-compose.yml up) and the phone on the same Wi-Fi." -ForegroundColor Yellow
