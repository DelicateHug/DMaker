#Requires -Version 5.1
<#
.SYNOPSIS
    Stop DMaker precisely.

.DESCRIPTION
    NEVER kill by image name (e.g. Stop-Process -Name node/python) - that would
    take down unrelated processes, including StudyPC itself. Target EXACT PIDs only:

      -ProcessId : the PID StudyPC launched; we kill its whole TREE (taskkill /T).
      -Port      : the PID actually listening on that port (and its tree).

    With neither, the whole start.ps1 set is stopped by sweeping the five ports
    it uses: prod UI/server, dev UI/server, and the runner daemon.

    The runner is stopped last so anything mid-flight keeps its owner alive for
    as long as possible.
#>
param(
    [int]$ProcessId = 0,
    [int]$Port = 0
)
$ErrorActionPreference = 'SilentlyContinue'

function Stop-Tree([int]$id) {
    if ($id -le 0) { return $false }
    if (-not (Get-Process -Id $id -ErrorAction SilentlyContinue)) { return $false }
    taskkill /PID $id /T /F | Out-Null      # by PID + child tree, never by name
    return $true
}

# The dev server runs under `tsx watch`, a supervisor that restarts its child
# whenever a source file changes. Killing only the listening child leaves that
# supervisor alive, and the next build that touches libs/*/dist makes it put a
# server straight back on the port. taskkill /T cannot reach it once its own
# parent has exited, because an orphan has no tree to walk.
#
# So walk UP from the port owner and kill the highest ancestor whose command
# line still points at this checkout. The path check is what keeps this precise:
# we never kill by image name, and never anything belonging to another project.
function Get-RepoAncestor([int]$id) {
    $repo = $PSScriptRoot
    $top = $id
    $current = $id
    for ($hop = 0; $hop -lt 6; $hop++) {
        $info = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
        if (-not $info) { break }
        $parentId = [int]$info.ParentProcessId
        if ($parentId -le 4) { break }
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$parentId" -ErrorAction SilentlyContinue
        if (-not $parent) { break }
        # Only climb through processes that are demonstrably part of this repo.
        if ($parent.CommandLine -and $parent.CommandLine -like "*$repo*") {
            $top = $parentId
            $current = $parentId
        } else {
            break
        }
    }
    return $top
}

function Stop-Port([int]$targetPort, [string]$label) {
    $stopped = $false
    $owners = (Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue).OwningProcess |
              Sort-Object -Unique
    foreach ($owner in $owners) {
        $target = Get-RepoAncestor ([int]$owner)
        if (Stop-Tree $target) {
            $stopped = $true
            if ($target -ne [int]$owner) {
                Write-Host "Stopped $label (PID tree $target, supervisor of $owner on port $targetPort)"
            } else {
                Write-Host "Stopped $label (PID tree $target on port $targetPort)"
            }
        }
    }
    return $stopped
}

$killed = $false
if (Stop-Tree $ProcessId) { $killed = $true; Write-Host "Stopped PID tree $ProcessId" }
if ($Port -gt 0) {
    if (Stop-Port $Port 'DMaker') { $killed = $true }
}

# No specific target - sweep the whole start.ps1 set. UIs first, runner last.
if ($ProcessId -le 0 -and $Port -le 0) {
    $targets = @(
        @{ Port = 3007; Label = 'prod UI' },
        @{ Port = 3017; Label = 'dev UI' },
        @{ Port = 3009; Label = 'prod server' },
        @{ Port = 3019; Label = 'dev server' },
        @{ Port = 3029; Label = 'runner' }
    )
    foreach ($target in $targets) {
        if (Stop-Port $target.Port $target.Label) { $killed = $true }
    }
}

if (-not $killed) { Write-Host "DMaker: nothing to stop (no matching PID or port owner)." }
