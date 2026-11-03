# Build GAS, the GLP app store, in the GLP clone C:\sites\gas: its worlds and site
# (servers/gas/tools/build.py) and its Dart packages.  reconcile.ps1 runs this when
# the clone's code changes or the last build did not finish; the app then runs from
# C:\sites\gas\servers\gas.  The talmonlab-deploy branch carries the worlds and the
# site prebuilt, so Python runs only where they are missing.
$ErrorActionPreference = 'Continue'
$gas = 'C:\sites\gas\servers\gas'
$dart = 'C:\tools\dart-sdk\bin\dart.exe'
Set-Location $gas
if (!(Test-Path "$gas\build\www\index.html") -or !(Test-Path 'C:\sites\gas\programs\vglp\cva\gas_worlds')) {
    $python = (Get-Content 'C:\sites\python.txt' -ErrorAction SilentlyContinue | Select-Object -First 1)
    if (!$python) { $python = 'python' }
    & $python -I tools\build.py
    if ($LASTEXITCODE -ne 0) { throw "build.py failed ($LASTEXITCODE)" }
}
& $dart pub get
if ($LASTEXITCODE -ne 0) { throw "dart pub get failed ($LASTEXITCODE)" }
'build-gas: done'
