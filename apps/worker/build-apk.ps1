# Builds the HomeHelp Pro (worker) debug APK pointed at this PC over Wi-Fi and installs it on a
# connected phone. Detects the Wi-Fi LAN IP and bakes http://<ip>:8080/ in via -PapiBase, so the
# app needs no USB cable / adb reverse at runtime. Rerun whenever the PC's Wi-Fi IP changes.
$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$appId = 'com.homehelp.pro'

function Resolve-FirstPath([string[]]$candidates) {
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

# -- Toolchain: JDK 17 + Android SDK (same lookup as apps/customer/build-apk.ps1) --
$javaCandidates = @($env:JAVA_HOME)
$adoptium = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1
if ($adoptium) { $javaCandidates += $adoptium.FullName }
$javaCandidates += 'C:\Program Files\Android\Android Studio\jbr'
$env:JAVA_HOME = Resolve-FirstPath $javaCandidates
if (-not $env:JAVA_HOME) { throw 'Could not locate a JDK 17. Install one or set $env:JAVA_HOME.' }

$env:ANDROID_HOME = Resolve-FirstPath @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))
if (-not $env:ANDROID_HOME) { throw 'Could not locate the Android SDK. Install it or set $env:ANDROID_HOME.' }
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) { $c = Get-Command adb -ErrorAction SilentlyContinue; if ($c) { $adb = $c.Source } }

# 1) Detect LAN IPv4 (prefer Wi-Fi over vEthernet/WSL adapters)
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Sort-Object { $_.InterfaceAlias -notlike '*Wi-Fi*' } |
  Select-Object -First 1).IPAddress
if (-not $ip) { throw 'Could not detect a LAN IP. Connect to Wi-Fi and retry.' }
$apiBase = "http://$ip`:8080/"
Write-Host "Backend URL  -> $apiBase" -ForegroundColor Cyan

# 2) Assemble APK with the URL baked in
Push-Location $root
.\gradlew.bat assembleDebug "-PapiBase=$apiBase"
if ($LASTEXITCODE) { Pop-Location; throw 'gradle build failed' }
Pop-Location
$apk = "$root\app\build\outputs\apk\debug\app-debug.apk"

# 3) Install + launch if a phone is connected
if ((Test-Path $adb) -and ((& $adb devices) -match "`tdevice")) {
  & $adb install -r $apk
  if ($LASTEXITCODE) { throw 'adb install failed' }
  # Wi-Fi only: drop any old USB tunnel (adb errors when there is none — that's fine).
  if ((& $adb reverse --list) -match 'tcp:8080') { & $adb reverse --remove tcp:8080 }
  & $adb shell monkey -p $appId -c android.intent.category.LAUNCHER 1 | Out-Null
  Write-Host "Installed. App points to $apiBase - keep the phone on the same Wi-Fi as this PC." -ForegroundColor Green
} else {
  Write-Host "Built $apk (no phone connected - install it manually)." -ForegroundColor Yellow
}
