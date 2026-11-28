param([string]$PostgresBin='C:\Program Files\PostgreSQL\18\bin')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifacts=[IO.Path]::GetFullPath((Join-Path $root 'artifacts'))
$run=Join-Path $artifacts ('foundation-'+[Guid]::NewGuid().ToString('N'))
$data=Join-Path $run 'pgdata'
if (!$data.StartsWith($artifacts+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'Invalid isolated path'}
if(Get-NetTCPConnection -LocalPort 55439 -State Listen -ErrorAction SilentlyContinue){throw 'Port is occupied; refusing to use an existing server'}
foreach($binary in @('initdb.exe','pg_ctl.exe','createdb.exe','dropdb.exe','psql.exe')){if(!(Test-Path -LiteralPath (Join-Path $PostgresBin $binary))){throw 'Missing PostgreSQL binary'}}
function Checked([string]$exe,[string[]]$arguments){& $exe @arguments;if($LASTEXITCODE -ne 0){throw "Isolated command failed: $exe"}}
$names=@('DATABASE_URL','DIRECT_URL','NESTBOX_TEST_DATABASE_URL','NESTBOX_ISOLATED_TEST','NODE_ENV','EMAIL_PROVIDER','INQUIRY_LOOKUP_SECRET','WDP_BANK_CODE','WDP_BANK_ACCOUNT_NUMBER')
$old=@{};foreach($name in $names){$old[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$started=$false;$created=$false
New-Item -ItemType Directory -Path $run | Out-Null
Push-Location $root
try {
 Checked (Join-Path $PostgresBin 'initdb.exe') @('-D',$data,'--auth=trust','--username=nestbox_test','--encoding=UTF8','--locale=C')
 Checked (Join-Path $PostgresBin 'pg_ctl.exe') @('-D',$data,'-l',(Join-Path $run 'postgres.log'),'-o','-p 55439 -h 127.0.0.1','-w','start')
 $started=$true
 Checked (Join-Path $PostgresBin 'createdb.exe') @('-h','127.0.0.1','-p','55439','-U','nestbox_test','nestbox_foundation_test')
 $created=$true
 $env:DATABASE_URL='postgresql://nestbox_test@127.0.0.1:55439/nestbox_foundation_test'
 $env:DIRECT_URL=$env:DATABASE_URL;$env:NESTBOX_TEST_DATABASE_URL=$env:DATABASE_URL;$env:NESTBOX_ISOLATED_TEST='1'
 $env:WDP_BANK_CODE='000000';$env:WDP_BANK_ACCOUNT_NUMBER='ISOLATED_NOT_A_REAL_ACCOUNT'
 $env:NODE_ENV='test';$env:EMAIL_PROVIDER='development';$env:INQUIRY_LOOKUP_SECRET='isolated-foundation-not-a-production-secret'
 Checked 'node' @('node_modules/prisma/build/index.js','migrate','deploy','--config','prisma.isolated.config.ts')
 Checked (Join-Path $PostgresBin 'psql.exe') @('-h','127.0.0.1','-p','55439','-U','nestbox_test','-d','nestbox_foundation_test','-v','ON_ERROR_STOP=1','-f','prisma/preflight/20261123000300_core_foundation_integrity.sql')
 # Compile current Backend so Nest constructor metadata is preserved in HTTP tests.
 Checked 'node' @('node_modules/typescript/bin/tsc','-p','tsconfig.build.json')
 Checked 'node' @('node_modules/vitest/vitest.mjs','run','--config','vitest.foundation.config.ts')
} finally {
 if($created){& (Join-Path $PostgresBin 'dropdb.exe') -h 127.0.0.1 -p 55439 -U nestbox_test nestbox_foundation_test}
 if($started){& (Join-Path $PostgresBin 'pg_ctl.exe') -D $data -m fast -w stop}
 foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$old[$name],'Process')}
 Pop-Location
 Write-Host "Isolated database stopped; logs: $run"
}
