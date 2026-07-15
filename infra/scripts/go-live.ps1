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

# cloudflared lives in a different place depending on how it was installed (winget / choco /
# the standalone .exe dropped in ~/.cloudflared), so find it rather than hardcoding one machine's
# path. Override with $env:CLOUDFLARED if yours is somewhere else entirely.
$cf = @(
    $env:CLOUDFLARED,
    'C:\Program Files (x86)\cloudflared\cloudflared.exe',
    'C:\Program Files\cloudflared\cloudflared.exe',
    (Join-Path $env:USERPROFILE '.cloudflared\cloudflared.exe'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\cloudflared.exe'),
    'C:\ProgramData\chocolatey\bin\cloudflared.exe'
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $cf) { $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source }
if (-not $cf) {
    Write-Host 'cloudflared not found. Install it (winget install Cloudflare.cloudflared) or set $env:CLOUDFLARED.' -ForegroundColor Red
    exit 1
}
Write-Host "Using cloudflared: $cf" -ForegroundColor DarkGray

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
# git reports normal progress on stderr. Under PowerShell 5.1, redirecting a native command's
# stderr (`2>$null`) wraps every line in a NativeCommandError, which $ErrorActionPreference='Stop'
# then treats as fatal — the script died here on a SUCCESSFUL push and never reached Wait-Process,
# so the tunnel was left running with nothing holding it. Let git write to stderr and only fail on
# a real non-zero exit code.
$ErrorActionPreference = 'Continue'
git add app-config.json
git commit -m 'chore: update live api url' | Out-Null
git push origin Baji
if ($LASTEXITCODE -ne 0) {
    Write-Host "git push failed (exit $LASTEXITCODE) — the tunnel is up but apps will not see the new URL." -ForegroundColor Red
}
$ErrorActionPreference = 'Stop'
Pop-Location
Write-Host 'Published to GitHub. Apps pick it up on next launch (GitHub raw can lag a few minutes).' -ForegroundColor Green
Write-Host 'Leave this window open while testing. Ctrl+C stops the tunnel.' -ForegroundColor Yellow

# 4) Keep the tunnel alive until Ctrl+C
Wait-Process -Id $p.Id
