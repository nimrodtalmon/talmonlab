param($name, $port, [switch]$Force)
$dir = "C:\sites\$name"
"--- $(Get-Date) $name"
$before = git -C $dir rev-parse HEAD
git -C $dir fetch -q origin
git -C $dir reset -q --hard '@{u}'
if ($Force -or (git -C $dir rev-parse HEAD) -ne $before) {
    if (Test-Path "C:\sites\build-$name.ps1") { powershell -ExecutionPolicy Bypass -File "C:\sites\build-$name.ps1" }
    else { & "$dir\.venv\Scripts\pip" install -q -r "$dir\requirements.txt" }
    Stop-ScheduledTask "$name-run" -ErrorAction SilentlyContinue
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    for ($i = 0; $i -lt 30 -and (Get-ScheduledTask "$name-run").State -eq 'Running'; $i++) { Start-Sleep 1 }
    Start-ScheduledTask "$name-run"
    "restarted $name"
}
