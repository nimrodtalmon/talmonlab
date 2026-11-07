# Build GAS2 on the web (servers/gas2/device, bin\web.dart) in its GLP clone
# C:\sites\gas2web, branch GAS2: its Dart packages.  Each person's super-app runs
# over the device tree of the GAS2 site's live build (GAS2_DATA, C:\sites\gas2-data),
# and libsodium is the one build-gasweb.ps1 fetched into C:\sites\libsodium.
# reconcile.ps1 runs this when the clone's code changes or the last build did not finish.
$ErrorActionPreference = 'Continue'
$dart = 'C:\tools\dart-sdk\bin\dart.exe'
if (!(Test-Path 'C:\sites\libsodium\libsodium.dll')) { throw 'no libsodium: build gasweb first (build-gasweb.ps1)' }
Set-Location 'C:\sites\gas2web\servers\gas2\device'
& $dart pub get
if ($LASTEXITCODE -ne 0) { throw "dart pub get failed ($LASTEXITCODE)" }
New-Item 'C:\sites\gas2web-data' -ItemType Directory -Force | Out-Null
'build-gas2web: done'
