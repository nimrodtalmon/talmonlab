# One-time switch to reconcile.ps1. Run in an admin PowerShell on the server:
#   git -C C:\sites\root pull
#   powershell -ExecutionPolicy Bypass -File C:\sites\root\server\bootstrap.ps1
$ErrorActionPreference = 'Stop'

# git as SYSTEM and as admins on the same clones
git config --system --add safe.directory '*'

# the Python that venvs are made from
(Get-Command python).Source | Set-Content C:\sites\python.txt

# secrets: a folder only Administrators and SYSTEM can read; move BGULAB's out of its run script
New-Item C:\sites\secrets -ItemType Directory -Force | Out-Null
icacls C:\sites\secrets /inheritance:r /grant:r 'Administrators:(OI)(CI)F' 'SYSTEM:(OI)(CI)F' | Out-Null
if (!(Test-Path C:\sites\secrets\lab.ps1) -and (Test-Path C:\sites\run-lab.ps1)) {
    Select-String C:\sites\run-lab.ps1 -Pattern 'GOVERN_PASS|GITHUB_TOKEN|SESSION_SECRET' |
        ForEach-Object { $_.Line } | Set-Content C:\sites\secrets\lab.ps1
    'moved BGULAB secrets to C:\sites\secrets\lab.ps1'
}

# old per-app update tasks and the home-page pull: reconcile does both now
foreach ($t in 'talmonlab-root-pull', 'lab-update', 'cdw-update', 'glp-update') {
    Unregister-ScheduledTask $t -Confirm:$false -ErrorAction SilentlyContinue
}

# the one task: every 5 minutes and at boot
$a = New-ScheduledTaskAction -Execute powershell.exe -Argument '-ExecutionPolicy Bypass -File C:\sites\root\server\reconcile.ps1'
$t1 = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$t2 = New-ScheduledTaskTrigger -AtStartup
$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask talmonlab-reconcile -Action $a -Trigger $t1, $t2 -Settings $s -User SYSTEM -Force | Out-Null
Start-ScheduledTask talmonlab-reconcile
'talmonlab-reconcile is running; see https://talmonlab.bgu.ac.il/status/ in a few minutes'
