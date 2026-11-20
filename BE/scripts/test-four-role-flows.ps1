param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$artifactsRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'FE\artifacts'))
$runRoot = Join-Path $artifactsRoot ('local-flows-' + [Guid]::NewGuid().ToString('N'))
$dataPath = [IO.Path]::GetFullPath((Join-Path $runRoot 'pgdata'))
if (!$dataPath.StartsWith($artifactsRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing a test data path outside project artifacts.' }
if (Get-NetTCPConnection -LocalPort 55439 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 55439 is already occupied. This test will not connect to an existing database.' }
foreach ($binary in @('initdb.exe','pg_ctl.exe','createdb.exe','dropdb.exe')) { if (!(Test-Path -LiteralPath (Join-Path $PostgresBin $binary))) { throw "Missing local PostgreSQL binary: $binary" } }
function Invoke-Checked([string]$Binary, [string[]]$Arguments) { & $Binary @Arguments; if ($LASTEXITCODE -ne 0) { throw "Test command failed with exit code $LASTEXITCODE : $Binary" } }
$names = @('DATABASE_URL','DIRECT_URL','NESTBOX_ISOLATED_TEST','UNIT_STAFF_ASSIGNMENTS_ENABLED','EMAIL_PROVIDER','NODE_ENV','INQUIRY_LOOKUP_SECRET')
$original = @{}; foreach ($name in $names) { $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$started = $false; $databaseCreated = $false
New-Item -ItemType Directory -Path $runRoot | Out-Null
Push-Location (Join-Path $projectRoot 'BE')
try {
  Invoke-Checked (Join-Path $PostgresBin 'initdb.exe') @('-D',$dataPath,'--auth=trust','--username=nestbox_test','--encoding=UTF8','--locale=C')
  Invoke-Checked (Join-Path $PostgresBin 'pg_ctl.exe') @('-D',$dataPath,'-l',(Join-Path $runRoot 'postgres.log'),'-o','-p 55439 -h 127.0.0.1','-w','start')
  $started = $true
  Invoke-Checked (Join-Path $PostgresBin 'createdb.exe') @('-h','127.0.0.1','-p','55439','-U','nestbox_test','nestbox_flow_test')
  $databaseCreated = $true
  $env:DATABASE_URL = 'postgresql://nestbox_test@127.0.0.1:55439/nestbox_flow_test'
  $env:DIRECT_URL = $env:DATABASE_URL
  $env:NESTBOX_ISOLATED_TEST = '1'; $env:UNIT_STAFF_ASSIGNMENTS_ENABLED = 'true'
  $env:EMAIL_PROVIDER = 'development'; $env:NODE_ENV = 'test'
  $env:INQUIRY_LOOKUP_SECRET = 'isolated-local-only-secret-with-more-than-32-characters'
  Write-Host 'Only the disposable database on 127.0.0.1:55439 is used. Shared database and .env are untouched.'
  Invoke-Checked 'npm.cmd' @('run','prisma:generate')
  Invoke-Checked 'npm.cmd' @('exec','--','prisma','migrate','deploy')
  Invoke-Checked 'npm.cmd' @('run','build')
  Invoke-Checked 'npm.cmd' @('exec','--','vitest','run','--config','vitest.config.e2e.ts','test/four-role-flow.e2e-spec.ts')
} finally {
  $cleanupError = $null
  if ($databaseCreated) { & (Join-Path $PostgresBin 'dropdb.exe') -h 127.0.0.1 -p 55439 -U nestbox_test nestbox_flow_test; if ($LASTEXITCODE -ne 0) { $cleanupError = 'Could not drop the isolated test database.' } }
  if ($started) { & (Join-Path $PostgresBin 'pg_ctl.exe') -D $dataPath -m fast -w stop; if ($LASTEXITCODE -ne 0) { $cleanupError = 'Could not stop the isolated PostgreSQL instance.' } }
  # Retain the empty cluster and logs; do not recursively remove directories.
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $original[$name], 'Process') }
  Pop-Location
  if ($cleanupError) { throw "$cleanupError Inspect $runRoot" }
  Write-Host 'Disposable test database dropped and server stopped. Empty cluster and logs retained under project artifacts.'
}
