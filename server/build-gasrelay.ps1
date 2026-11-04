# Build gasrelay, the relay of GAS phones that are not near each other: its Dart
# packages.  It replaced udpcheck (inbound UDP never reaches talmonlab through
# BGU's network), whose firewall rules are removed here.
$ErrorActionPreference = 'Continue'
foreach ($p in 443, 9516, 3478) { netsh advfirewall firewall delete rule name="talmonlab-udpcheck-$p" | Out-Null }
Set-Location 'C:\sites\gasrelay\server\gasrelay'
& 'C:\tools\dart-sdk\bin\dart.exe' pub get
if ($LASTEXITCODE -ne 0) { throw "dart pub get failed ($LASTEXITCODE)" }
'build-gasrelay: done'
