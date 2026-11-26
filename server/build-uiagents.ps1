# Build uiagents, the real GLP agents of the UI layer's web demo (servers/uiagents of the
# GLP fork, branch ui-agents): its Dart packages, glp_runtime's among them.
$ErrorActionPreference = 'Continue'
Set-Location 'C:\sites\uiagents\servers\uiagents'
& 'C:\tools\dart-sdk\bin\dart.exe' pub get
if ($LASTEXITCODE -ne 0) { throw "dart pub get failed ($LASTEXITCODE)" }
'build-uiagents: done'
