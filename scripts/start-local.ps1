param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = (Get-Command node).Source
$npmExe = (Get-Command npm.cmd).Source
$logs = Join-Path $projectRoot 'FE\artifacts'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$lanAddress = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1 -ExpandProperty IPv4Address | Select-Object -First 1 -ExpandProperty IPAddress
if (-not $lanAddress) { $lanAddress = '127.0.0.1' }
# Process-scoped public URLs override stale addresses from mobile/.env.local.
$env:EXPO_PUBLIC_API_URL = "http://${lanAddress}:3000/api"
$env:FRONTEND_URL = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081,http://${lanAddress}:5173,http://${lanAddress}:8081"
if (-not $SkipBuild) {
  Push-Location (Join-Path $projectRoot 'BE')
  try {
    & $npmExe run prisma:generate
    if ($LASTEXITCODE) { throw 'Prisma Client generation failed.' }
    & $npmExe run build
    if ($LASTEXITCODE) { throw 'Backend build failed.' }
  } finally { Pop-Location }
}
$services = @(
  @{ Port = 3000; Folder = 'BE'; Name = 'be'; Args = @('dist/main.js') },
  @{ Port = 5173; Folder = 'FE'; Name = 'fe'; Args = @('node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5173', '--strictPort') },
  @{ Port = 8081; Folder = 'mobile'; Name = 'mobile'; Args = @('node_modules/expo/bin/cli', 'start', '--lan', '--port', '8081') }
)
foreach ($service in $services) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue
  if ($listener) {
    Write-Host "Port $($service.Port) is already running; left unchanged. Restart that service if its source or Wi-Fi address changed."
    continue
  }
  Start-Process -FilePath $nodeExe -ArgumentList $service.Args -WorkingDirectory (Join-Path $projectRoot $service.Folder) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$($service.Name)-runtime.log") -RedirectStandardError (Join-Path $logs "$($service.Name)-runtime.err.log") | Out-Null
}
Write-Host 'Web: http://127.0.0.1:5173/account/login'
Write-Host 'API: http://127.0.0.1:3000/api/docs'
Write-Host "Expo: exp://${lanAddress}:8081 (same Wi-Fi)"
Write-Host "Mobile web: http://${lanAddress}:8081"
Write-Host 'No migration, seed or database reset was run.'
