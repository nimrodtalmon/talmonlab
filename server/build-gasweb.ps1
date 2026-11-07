# Build GAS on the web (servers/gas2/device, bin\web.dart) in its GLP clone
# C:\sites\gasweb, branch main: its Dart packages, and libsodium for the relay's
# encryption, fetched once into C:\sites\libsodium.  Each person's super-app runs
# over the device tree of the GAS site's live build (GAS2_DATA, C:\sites\gas2-data).
# reconcile.ps1 runs this when the clone's code changes or the last build did not finish.
$ErrorActionPreference = 'Continue'
$dart = 'C:\tools\dart-sdk\bin\dart.exe'
$sodium = 'C:\sites\libsodium\libsodium.dll'
if (!(Test-Path $sodium)) {
    New-Item 'C:\sites\libsodium' -ItemType Directory -Force | Out-Null
    $zip = 'C:\sites\libsodium\libsodium-msvc.zip'
    Invoke-WebRequest 'https://github.com/jedisct1/libsodium/releases/download/1.0.20-RELEASE/libsodium-1.0.20-msvc.zip' -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath 'C:\sites\libsodium\x' -Force
    $dll = Get-ChildItem 'C:\sites\libsodium\x' -Recurse -Filter libsodium.dll |
        Where-Object { $_.FullName -match '\\x64\\Release\\v14\d\\dynamic\\' } |
        Sort-Object FullName -Descending | Select-Object -First 1
    if (!$dll) { throw 'no x64 libsodium.dll in the zip' }
    Copy-Item $dll.FullName $sodium
    "libsodium: $($dll.FullName)"
}
Set-Location 'C:\sites\gasweb\servers\gas2\device'
& $dart pub get
if ($LASTEXITCODE -ne 0) { throw "dart pub get failed ($LASTEXITCODE)" }
New-Item 'C:\sites\gas2web-data' -ItemType Directory -Force | Out-Null
'build-gasweb: done'
