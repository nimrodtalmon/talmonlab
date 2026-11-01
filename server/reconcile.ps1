# Makes the server match this repo. Runs every 5 minutes and at boot, as SYSTEM
# (scheduled task talmonlab-reconcile), from C:\sites\root\server.
#
#   1. Pull this repo into C:\sites\root (the home page; these scripts).
#   2. For each app in apps.json: clone or update its repo; install (Python) or
#      run its build script when the code changed; write C:\sites\run-<name>.ps1;
#      make sure the task <name>-run exists; restart the app when anything changed
#      or when it is down.
#   3. Apps no longer in apps.json: stop them and remove their task (files stay).
#   4. Rewrite the Caddyfile from apps.json; restart Caddy only if it changed.
#   5. Write the status page (C:\sites\status, served at /status).
#
# Log: C:\sites\logs\reconcile.log. Secrets: C:\sites\secrets\<name>.ps1 (never in the repo).

$Sites   = 'C:\sites'
$Root    = "$Sites\root"
$Here    = "$Root\server"
$Logs    = "$Sites\logs"
$LogFile = "$Logs\reconcile.log"
$Status  = "$Sites\status"
$StateF  = "$Sites\state.json"
$Caddy   = "$Sites\caddy"
New-Item $Logs, $Status, "$Sites\secrets" -ItemType Directory -Force | Out-Null

function Log($m) { Add-Content $LogFile "$(Get-Date -Format s) $m" }

$GitExe = 'git.exe'   # explicit, so it never resolves to a PowerShell function

function Invoke-Git([string]$dir) {
    # Runs git in $dir with the remaining arguments; returns stdout, logs stderr.
    $out = & $GitExe -C $dir @args 2>&1
    $out | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] -and "$($_.Exception.Message)".Trim() -and $_.Exception.Message -ne 'System.Management.Automation.RemoteException' } | ForEach-Object { Log "  git: $($_.Exception.Message)" }
    $out | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }
}

function Sync-Repo($dir, $url, $branch) {
    # Clone, or move to the GitHub version. Returns $true if the code changed.
    # With a branch: that branch alone, shallow (for big repositories such as GLP),
    # long paths allowed.  An app whose repo or branch changed is cloned afresh;
    # the old clone is moved aside to <dir>.old-<time>, not deleted.
    if ((Test-Path $dir) -and !(Test-Path "$dir\.git")) {
        $aside = "$dir.old-$(Get-Date -Format yyyyMMddHHmmss)"
        Log "  $dir is not a clone; moving it to $aside"
        Move-Item $dir $aside
    }
    if (Test-Path "$dir\.git") {
        $haveUrl = "$(Invoke-Git $dir remote get-url origin)".Trim()
        $haveBranch = "$(Invoke-Git $dir rev-parse --abbrev-ref HEAD)".Trim()
        if ($haveUrl -ne $url -or ($branch -and $haveBranch -ne $branch)) {
            $aside = "$dir.old-$(Get-Date -Format yyyyMMddHHmmss)"
            Log "  repo or branch changed ($haveUrl $haveBranch); moving the old clone to $aside"
            Move-Item $dir $aside
        }
    }
    if (!(Test-Path "$dir\.git")) {
        if ($branch) {
            & $GitExe -c core.longpaths=true clone -q --depth 1 --single-branch -b $branch $url $dir 2>&1 | ForEach-Object { Log "  git: $_" }
            Invoke-Git $dir config core.longpaths true | Out-Null
        } else {
            & $GitExe clone -q $url $dir 2>&1 | ForEach-Object { Log "  git: $_" }
        }
        return $true
    }
    $before = Invoke-Git $dir rev-parse HEAD
    if ($branch) { Invoke-Git $dir fetch -q --depth 1 origin $branch | Out-Null }
    else { Invoke-Git $dir fetch -q origin | Out-Null }
    Invoke-Git $dir reset -q --hard '@{u}' | Out-Null
    return ((Invoke-Git $dir rev-parse HEAD) -ne $before)
}

function Run-Script($app) {
    $lines = @()
    if ($app.env) {
        foreach ($p in $app.env.PSObject.Properties) { $lines += "`$env:$($p.Name) = '$($p.Value)'" }
    }
    $secrets = "$Sites\secrets\$($app.name).ps1"
    $lines += "if (Test-Path '$secrets') { . '$secrets' }"
    $wd = if ($app.workdir) { $app.workdir } else { "$Sites\$($app.name)" }
    $lines += "Set-Location '$wd'"
    $lines += $app.start
    return ($lines -join "`r`n")
}

function Setup-App($app) {
    # Install or build; on success, record the commit built in <name>.built, so that
    # a build that did not finish (or failed) is tried again on the next run.
    $dir = "$Sites\$($app.name)"
    Remove-Item "$Sites\$($app.name).built" -ErrorAction SilentlyContinue
    if ($app.build) {
        Log "  building $($app.name)"
        & powershell -ExecutionPolicy Bypass -File "$Here\$($app.build)" 2>&1 | ForEach-Object { Log "  $_" }
        if ($LASTEXITCODE -ne 0) { throw "build script failed ($LASTEXITCODE)" }
    } elseif (Test-Path "$dir\requirements.txt") {
        if (!(Test-Path "$dir\.venv")) {
            $python = (Get-Content "$Sites\python.txt" -ErrorAction SilentlyContinue | Select-Object -First 1)
            if (!$python) { $python = 'python' }
            Log "  creating venv for $($app.name)"
            & $python -m venv "$dir\.venv" 2>&1 | ForEach-Object { Log "  $_" }
        }
        Log "  installing $($app.name)"
        & "$dir\.venv\Scripts\pip" install -q -r "$dir\requirements.txt" 2>&1 | ForEach-Object { Log "  $_" }
    }
    Set-Content "$Sites\$($app.name).built" "$(Invoke-Git $dir rev-parse HEAD)"
}

function Built($app) {
    # The commit last built and installed is the one checked out.
    $f = "$Sites\$($app.name).built"
    (Test-Path $f) -and ("$(Get-Content $f -Raw)".Trim() -eq "$(Invoke-Git "$Sites\$($app.name)" rev-parse HEAD)".Trim())
}

function Listening($port) {
    [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Ensure-Task($name) {
    if (Get-ScheduledTask "$name-run" -ErrorAction SilentlyContinue) { return }
    $set = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    $run = New-ScheduledTaskAction -Execute powershell.exe -Argument "-ExecutionPolicy Bypass -Command `"& $Sites\run-$name.ps1 *>> $Logs\$name.log`""
    Register-ScheduledTask -TaskName "$name-run" -Action $run -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $set -User SYSTEM -Force | Out-Null
    Log "  registered task $name-run"
}

function Stop-App($name, $port) {
    Stop-ScheduledTask "$name-run" -ErrorAction SilentlyContinue
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    for ($i = 0; $i -lt 30 -and (Get-ScheduledTask "$name-run" -ErrorAction SilentlyContinue).State -eq 'Running'; $i++) { Start-Sleep 1 }
}

function Caddyfile($apps) {
    $b = @('talmonlab.bgu.ac.il {')
    foreach ($a in $apps) {
        $b += "`tredir /$($a.name) /$($a.name)/"
        $b += "`thandle_path /$($a.name)/* {"
        $b += "`t`treverse_proxy 127.0.0.1:$($a.port)"
        $b += "`t}"
    }
    $b += "`tredir /status /status/"
    $b += "`thandle_path /status/* {"
    $b += "`t`troot * C:/sites/status"
    $b += "`t`tfile_server"
    $b += "`t}"
    $b += "`thandle {"
    $b += "`t`troot * C:/sites/root"
    $b += "`t`tfile_server {"
    $b += "`t`t`thide .git server"
    $b += "`t`t}"
    $b += "`t}"
    $b += '}'
    return ($b -join "`n") + "`n"
}

function Html([string]$s) { [System.Net.WebUtility]::HtmlEncode($s) }

# ---------------------------------------------------------------------------

Log '--- reconcile'
$state = @{}
if (Test-Path $StateF) {
    try {
        (Get-Content $StateF -Raw | ConvertFrom-Json).PSObject.Properties |
            ForEach-Object { $state[$_.Name] = @{ restarted = $_.Value.restarted; error = $_.Value.error; port = $_.Value.port } }
    } catch { Log "state unreadable: $_" }
}

# 1. this repo
if (Sync-Repo $Root $null) { Log 'home repo updated' }

try {
    # Windows PowerShell 5.1 emits a JSON array as ONE object; ForEach-Object unrolls it.
    $apps = @(Get-Content "$Here\apps.json" -Raw | ConvertFrom-Json | ForEach-Object { $_ })
} catch {
    Log "apps.json unreadable, nothing else done: $_"
    exit 1
}
$bad = @($apps | Where-Object { "$($_.name)" -notmatch '^[a-z0-9-]+$' -or "$($_.port)" -notmatch '^\d+$' -or -not $_.repo -or -not $_.start })
if ($bad.Count -or -not $apps.Count) {
    Log "apps.json has a malformed entry (name, port, repo, start); nothing else done"
    exit 1
}

# 2. apps
foreach ($app in $apps) {
    $name = $app.name
    $isNew = -not $state.ContainsKey($name)
    if ($isNew) { $state[$name] = @{ restarted = ''; error = ''; port = $app.port } }
    $state[$name].port = $app.port
    try {
        $changed = Sync-Repo "$Sites\$name" $app.repo $app.branch
        if ($changed) { Log "${name}: code changed" }
        $runPath = "$Sites\run-$name.ps1"
        $script = Run-Script $app
        $old = if (Test-Path $runPath) { "$(Get-Content $runPath -Raw)".TrimEnd() } else { '' }
        $scriptChanged = ($old -ne $script)
        if ($scriptChanged) { Set-Content $runPath $script; Log "${name}: run script written" }
        $unbuilt = -not (Built $app)
        if ($unbuilt -and -not ($changed -or $isNew)) { Log "${name}: not built at this commit; building" }
        if ($changed -or $isNew -or $unbuilt) { Setup-App $app; $changed = $true }
        Ensure-Task $name
        $down = -not (Listening $app.port) -and (Get-ScheduledTask "$name-run").State -ne 'Running'
        if ($changed -or $scriptChanged -or $isNew -or $down) {
            if ($down) { Log "${name}: was down" }
            Stop-App $name $app.port
            Start-ScheduledTask "$name-run"
            $state[$name].restarted = (Get-Date -Format s)
            Log "${name}: restarted"
        }
        $state[$name].error = ''
    } catch {
        $state[$name].error = "$_"
        Log "${name}: ERROR $_"
    }
}

# 3. removed apps
foreach ($name in @($state.Keys)) {
    if ($apps.name -notcontains $name) {
        $port = "$($state[$name].port)"
        if ($port -match '^\d+$') { Stop-App $name $port } else { Stop-ScheduledTask "$name-run" -ErrorAction SilentlyContinue }
        Unregister-ScheduledTask "$name-run" -Confirm:$false -ErrorAction SilentlyContinue
        $state.Remove($name)
        Log "${name}: removed (files left in $Sites\$name)"
    }
}

# 4. Caddy
$want = Caddyfile $apps
$have = if (Test-Path "$Caddy\Caddyfile") { Get-Content "$Caddy\Caddyfile" -Raw } else { '' }
if ($have.Replace("`r", '') -ne $want) {
    $tmp = "$Caddy\Caddyfile.new"
    [IO.File]::WriteAllText($tmp, $want)
    & "$Caddy\caddy.exe" validate --config $tmp --adapter caddyfile 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Move-Item $tmp "$Caddy\Caddyfile" -Force
        Restart-Service caddy
        Log 'Caddyfile updated, caddy restarted'
    } else {
        Log 'new Caddyfile did not validate; kept the old one'
    }
}

$state | ConvertTo-Json -Depth 3 | Set-Content $StateF

# 5. status page
$rows = foreach ($app in $apps) {
    $name = $app.name
    $c = (Invoke-Git "$Sites\$name" log -1 '--format=%h|%cd|%s' '--date=format:%Y-%m-%d %H:%M') -split '\|', 3
    $up = Listening $app.port
    $missing = @()
    if ($app.secrets) {
        $sec = Get-Content "$Sites\secrets\$name.ps1" -Raw -ErrorAction SilentlyContinue
        $missing = @($app.secrets | Where-Object { -not $sec -or $sec -notmatch "\`$env:$_\s*=" })
    }
    $note = @()
    if ($missing) { $note += 'missing secrets: ' + ($missing -join ', ') }
    if ($state[$name].error) { $note += 'error: ' + $state[$name].error }
    "<tr><td><a href=""/$name/"">/$name</a></td><td class=""$(if ($up) {'up'} else {'down'})"">$(if ($up) {'up'} else {'down'})</td>" +
    "<td><code>$(Html $c[0])</code> $(Html $c[1])<br><span class=""m"">$(Html $c[2])</span></td>" +
    "<td>$(Html $state[$name].restarted)</td><td>$(Html ($note -join '; '))</td></tr>"
}
$homeCommit = (Invoke-Git $Root log -1 '--format=%h %cd' '--date=format:%Y-%m-%d %H:%M')
$tail = Get-Content $LogFile -Tail 25 | ForEach-Object { Html $_ }
@"
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>talmonlab status</title>
<style>body{font-family:system-ui,sans-serif;max-width:60em;margin:3em auto;padding:0 1em}table{border-collapse:collapse;width:100%}
td,th{text-align:left;padding:.5em;border-bottom:1px solid #ddd;vertical-align:top}.up{color:#1a7f37}.down{color:#cf222e;font-weight:bold}
.m{color:#666;font-size:.9em}pre{background:#f6f8fa;padding:1em;overflow-x:auto;font-size:.8em}</style></head><body>
<h1>talmonlab status</h1>
<p class="m">Checked $(Get-Date -Format 'yyyy-MM-dd HH:mm') (every 5 minutes). Home page at <code>$(Html $homeCommit)</code>.
How this works: <a href="https://github.com/nimrodtalmon/talmonlab/tree/main/server">server/</a>.</p>
<table><tr><th>app</th><th>state</th><th>code</th><th>last restart</th><th>notes</th></tr>
$($rows -join "`n")
</table>
<h2>Recent log</h2><pre>$($tail -join "`n")</pre>
</body></html>
"@ | Set-Content "$Status\index.html" -Encoding UTF8

# keep logs small
Get-ChildItem $Logs -Filter *.log | Where-Object { $_.Length -gt 2MB } | ForEach-Object {
    try { $keep = Get-Content $_.FullName -Tail 5000; Set-Content $_.FullName $keep -ErrorAction Stop } catch { }
}
Log 'done'
