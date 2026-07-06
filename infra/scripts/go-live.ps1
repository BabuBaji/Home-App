# go-live.ps1 — make the HomeHelp customer & worker apps reachable from ANY device/network.
#
# What it does (one command):
#   1. Starts the microservices stack behind the API gateway on :8080 (if not already running).
#   2. Opens a public Cloudflare tunnel to the gateway.
#   3. Publishes the tunnel's public URL into app-config.json and pushes it to GitHub.
#
# The installed apps read app-config.json at startup, so you NEVER rebuild or reinstall
# the APKs — just run this, share the APK once, and every phone works on Wi-Fi OR mobile data.
# Keep this window open while testing; press Ctrl+C to stop.

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path   # repo root (infra/scripts -> ..\..)
$cf = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

# 1) Microservices gateway on :8080 (brings up the whole compose stack if needed)
$running = $false
try { $null = Invoke-WebRequest -Uri 'http://localhost:8080/health' -TimeoutSec 3 -UseBasicParsing; $running = $true } catch {}
if (-not $running) {
    Write-Host 'Starting the microservices stack (docker compose) ...' -ForegroundColor Cyan
    Push-Location $repo
    docker compose -f infra/docker-compose.yml up -d --build
    Pop-Location
    # wait for the gateway to answer
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        try { $null = Invoke-WebRequest -Uri 'http://localhost:8080/health' -TimeoutSec 2 -UseBasicParsing; break } catch {}
    }
} else {
    Write-Host 'Gateway already running on :8080.' -ForegroundColor Green
}

# 2) Cloudflare tunnel
$out = Join-Path $env:TEMP 'hh-cf-out.log'
$err = Join-Path $env:TEMP 'hh-cf-err.log'
Remove-Item $out, $err -ErrorAction SilentlyContinue
Write-Host 'Opening Cloudflare tunnel ...' -ForegroundColor Cyan
$p = Start-Process -FilePath $cf `
    -ArgumentList 'tunnel', '--url', 'http://localhost:8080', '--no-autoupdate' `
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
$json | Out-File -FilePath (Join-Path $repo 'app-config.json') -Encoding ascii
Push-Location $repo
git add app-config.json
git commit -m 'chore: update live api url' 2>$null | Out-Null
git push origin Baji 2>$null | Out-Null
Pop-Location
Write-Host 'Published to GitHub. Apps pick it up on next launch (GitHub may take up to ~1 min).' -ForegroundColor Green
Write-Host 'Leave this window open while testing. Ctrl+C stops the tunnel.' -ForegroundColor Yellow

# 4) Keep the tunnel alive until Ctrl+C
Wait-Process -Id $p.Id
