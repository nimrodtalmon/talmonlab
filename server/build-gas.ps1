# Build GAS, the GLP app store, in the GLP clone C:\sites\gas: its worlds and site
# (servers/gas/tools/build.py), its Dart packages, and the GLP REPL its app maker
# runs (glp_runtime\bin\glp_repl.exe, beside the REPL's source, whose place gives
# the REPL its root, ..\..\programs).  reconcile.ps1 runs this when the clone's
# code changes or the last build did not finish; the app then runs from
# C:\sites\gas\servers\gas.  The gas-deploy branch carries the worlds and the
# site prebuilt, so Python runs only where they are missing.
$ErrorActionPreference = 'Continue'
$gas = 'C:\sites\gas\servers\gas'
$rt = 'C:\sites\gas\glp_runtime'
$dart = 'C:\tools\dart-sdk\bin\dart.exe'
$python = (Get-Content 'C:\sites\python.txt' -ErrorAction SilentlyContinue | Select-Object -First 1)
if (!$python) { $python = 'python' }
Set-Location $gas
if (!(Test-Path "$gas\build\www\index.html") -or !(Test-Path 'C:\sites\gas\programs\vglp\cva\gas_worlds')) {
    & $python -I tools\build.py
    if ($LASTEXITCODE -ne 0) { throw "build.py failed ($LASTEXITCODE)" }
}
& $dart pub get
if ($LASTEXITCODE -ne 0) { throw "dart pub get failed ($LASTEXITCODE)" }
Set-Location $rt
& $dart pub get
if ($LASTEXITCODE -ne 0) { throw "dart pub get (glp_runtime) failed ($LASTEXITCODE)" }
& $dart compile exe bin\glp_repl.dart -o bin\glp_repl.exe
if ($LASTEXITCODE -ne 0) { throw "compiling the REPL failed ($LASTEXITCODE)" }
New-Item 'C:\sites\gas-made' -ItemType Directory -Force | Out-Null
# What the app maker needs beside the REPL: Python, and bash with perl (Git for Windows').
"python: $python"
foreach ($b in 'C:\Program Files\Git\bin\bash.exe', 'C:\Program Files\Git\usr\bin\bash.exe') {
    if (Test-Path $b) { "bash: $b"; & $b -c 'perl -e "print qq(perl: \$^V\n)"' 2>&1; break }
}
# The REPL, once: it starts and reads the root self.glp.
':quit' | & "$rt\bin\glp_repl.exe" 2>&1 | Select-String -Pattern 'Loaded root|Error' | ForEach-Object { "repl: $_" }
'build-gas: done'
