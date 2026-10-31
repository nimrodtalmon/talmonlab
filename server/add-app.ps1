# Registers the two scheduled tasks of an app, both running as SYSTEM:
#   <name>-run     starts C:\sites\run-<name>.ps1 at boot (restarts if it fails)
#   <name>-update  every 5 minutes: C:\sites\update.ps1 <name> <port>
# Output goes to C:\sites\logs\<name>.log and C:\sites\logs\update.log.
# Usage (admin PowerShell):  . C:\sites\add-app.ps1; Add-App lab 4101
function Add-App($name, $port) {
    $set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    $run = New-ScheduledTaskAction -Execute powershell.exe -Argument "-ExecutionPolicy Bypass -Command `"& C:\sites\run-$name.ps1 *>> C:\sites\logs\$name.log`""
    Register-ScheduledTask -TaskName "$name-run" -Action $run -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $set -User SYSTEM -Force | Out-Null
    $upd = New-ScheduledTaskAction -Execute powershell.exe -Argument "-ExecutionPolicy Bypass -Command `"& C:\sites\update.ps1 $name $port *>> C:\sites\logs\update.log`""
    $t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
    Register-ScheduledTask -TaskName "$name-update" -Action $upd -Trigger $t -User SYSTEM -Force | Out-Null
}
