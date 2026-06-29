# go-live.ps1 — make the HomeHelp customer & worker apps reachable from ANY device/network.
#
# What it does (one command):
#   1. Starts the shared backend on :4000 (if not already running).
#   2. Opens a public Cloudflare tunnel to it.
#   3. Publishes the tunnel's public URL into app-config.json and pushes it to GitHub.
#
# The installed apps read app-config.json at startup, so you NEVER rebuild or reinstall
# the APKs — just run this, share the APK once, and every phone works on Wi-Fi OR mobile data.
# Keep this window open while testing; press Ctrl+C to stop.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cf = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

# 1) Backend on :4000
$running = $false
try { $null = Invoke-WebRequest -Uri 'http://localhost:4000/api/services' -TimeoutSec 3 -UseBasicParsing; $running = $true } catch {}
if (-not $running) {
    Write-Host 'Starting backend on :4000 ...' -ForegroundColor Cyan
    Start-Process -FilePath 'node' -ArgumentList 'server/index.js' -WorkingDirectory (Join-Path $root 'customer-app') -WindowStyle Minimized
    Start-Sleep -Seconds 4
} else {
    Write-Host 'Backend already running on :4000.' -ForegroundColor Green
}

# 2) Cloudflare tunnel
$out = Join-Path $env:TEMP 'hh-cf-out.log'
$err = Join-Path $env:TEMP 'hh-cf-err.log'
Remove-Item $out, $err -ErrorAction SilentlyContinue
Write-Host 'Opening Cloudflare tunnel ...' -ForegroundColor Cyan
$p = Start-Process -FilePath $cf `
    -ArgumentList 'tunnel', '--url', 'http://localhost:4000', '--no-autoupdate' `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err

$url = $null
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    foreach ($f in @($out, $err)) {
        if (Test-Path $f) {
            $m = Select-String -Path $f -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($m) { $url = $m.Matches[0].Value; break }
        }
    }
    if ($url) { break }
}
if (-not $url) { Write-Host 'Could not read the tunnel URL. Is cloudflared installed?' -ForegroundColor Red; exit 1 }
Write-Host "Public URL: $url" -ForegroundColor Green

# 3) Publish to app-config.json + push to GitHub
$json = "{`n  `"apiBase`": `"$url`"`n}"
$json | Out-File -FilePath (Join-Path $root 'app-config.json') -Encoding ascii
Push-Location $root
git add app-config.json
git commit -m 'chore: update live api url' 2>$null | Out-Null
git push origin Baji 2>$null | Out-Null
Pop-Location
Write-Host 'Published to GitHub. Apps pick it up on next launch (GitHub may take up to ~1 min).' -ForegroundColor Green
Write-Host 'Leave this window open while testing. Ctrl+C stops the tunnel.' -ForegroundColor Yellow

# 4) Keep the tunnel alive until Ctrl+C
Wait-Process -Id $p.Id
