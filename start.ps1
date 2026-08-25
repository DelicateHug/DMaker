#Requires -Version 5.1
<#
.SYNOPSIS
    Start DMaker as a dev/prod pair against this checkout.

.DESCRIPTION
    Brings up five processes and supervises them:

        runner  127.0.0.1:3029   owns task execution (its own PID, never restarted)
        prod    localhost:3007 -> localhost:3009   executes, can Update Prod
        dev     localhost:3017 -> localhost:3019   read-only, browse and edit

    Both halves register this checkout as one of their own projects, so DMaker
    shows up on its own board on either side without being added by hand. They
    keep separate data directories (data/ for prod, data-dev/ for dev) so two
    live servers never fight over one settings.json.

    Dev is read-only: it refuses to start agents, features, pipelines, deploys
    and terminals. Prod does the running - and it delegates that to the runner
    daemon, which is why "Update Prod" can rebuild and restart the prod server
    without stopping work that is already in flight.

    The dev half is exactly what `npm run dev:full` gives you (tsx-watch server
    plus Vite), just with the read-only flag and its own data directory.

.PARAMETER Port
    Base port. The prod UI binds to it and everything else is derived:
    prod server = Port+2, dev UI = Port+10, dev server = Port+12,
    runner = Port+22. The default of 3007 reproduces DMaker's standard layout
    (3007/3009/3017/3019/3029), which is what RESERVED_PORTS protects.

    StudyPC passes -Port and then opens http://localhost:<Port>, which lands on
    prod - the half that can actually run things.

.PARAMETER SkipBuild
    Never build, even if the prod bundles are missing or stale. Fast, but prod
    will serve whatever was built last.

.PARAMETER ForceBuild
    Always build, even when nothing looks stale.

.EXAMPLE
    .\start.ps1
    .\start.ps1 -Port 3007
    .\start.ps1 -SkipBuild
#>
param(
    [int]$Port = 0,
    [switch]$SkipBuild,
    [switch]$ForceBuild
)

# ===================== StudyPC app-usage tracking (keep at top) =====================
# App identity = this folder's name. StudyPC measures time-in-app by polling the named
# mutex below, which this launcher keeps alive for the app's lifetime. Don't rename the $App* vars.
$AppName      = 'DMaker'
$AppMutexName = "Local\StudyPC.App.$AppName"
$mutex = New-Object System.Threading.Mutex($false, $AppMutexName)
try   { $ownsMutex = $mutex.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
# ===================================================================================

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$Root = $PSScriptRoot

# --- port layout ------------------------------------------------------------
if ($Port -le 0) { $Port = 3007 }
$ProdUiPort     = $Port
$ProdServerPort = $Port + 2
$DevUiPort      = $Port + 10
$DevServerPort  = $Port + 12
$RunnerPort     = $Port + 22

$ProdUiUrl = "http://localhost:$ProdUiPort"
$DevUiUrl  = "http://localhost:$DevUiPort"
$RunnerUrl = "http://127.0.0.1:$RunnerPort"

# Processes we started, newest last. Everything here is killed on the way out.
$Started = New-Object System.Collections.ArrayList

function Write-Step([string]$Message, [string]$Color = 'Cyan') {
    Write-Host "[DMaker] $Message" -ForegroundColor $Color
}

function Clear-DMakerEnv {
    # Start-Process inherits this process's environment, so each launch is set up
    # by assigning $env: vars immediately before it. Clearing first stops one
    # process's settings leaking into the next.
    foreach ($name in @(
        'DMAKER_ROLE', 'DMAKER_ENV', 'DMAKER_READ_ONLY', 'DMAKER_PEER_URL',
        'DMAKER_SELF_URL', 'DMAKER_RUNNER_URL', 'DMAKER_SELF_PROJECT',
        'DMAKER_LAUNCHER_MANAGED', 'DATA_DIR', 'PORT', 'TEST_PORT',
        'VITE_SERVER_URL', 'VITE_APP_MODE', 'CORS_ORIGIN'
    )) {
        Remove-Item "env:$name" -ErrorAction SilentlyContinue
    }
}

# Start-Process needs a real executable. Bare `npm` on Windows resolves to the
# extensionless shell script, which CreateProcess rejects with "not a valid
# Win32 application"; the launchable one is the npm.cmd shim next to it.
$NpmExe = (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue).Source
if (-not $NpmExe) { $NpmExe = (Get-Command 'npm' -ErrorAction SilentlyContinue).Source }
if (-not $NpmExe) { throw 'npm was not found on PATH.' }

function Start-Tracked([string]$Label, [string[]]$ArgumentList) {
    $proc = Start-Process -FilePath $NpmExe -ArgumentList $ArgumentList -PassThru -NoNewWindow
    [void]$Started.Add([pscustomobject]@{ Label = $Label; Process = $proc })
    Write-Step "$Label started (PID $($proc.Id))"
    return $proc
}

function Stop-Tracked($Entry) {
    if ($null -eq $Entry -or $null -eq $Entry.Process) { return }
    if ($Entry.Process.HasExited) { return }
    # By PID and its children only - never by image name, which would take down
    # unrelated node processes (StudyPC's own, other projects', this script's).
    taskkill /PID $Entry.Process.Id /T /F 2>$null | Out-Null
}

function Wait-ForHealth([int]$HealthPort, [string]$Label, [int]$TimeoutSeconds = 90) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $res = Invoke-WebRequest -Uri "http://localhost:$HealthPort/api/health" `
                -UseBasicParsing -TimeoutSec 3
            if ($res.StatusCode -eq 200) {
                Write-Step "$Label is ready on $HealthPort" 'Green'
                return $true
            }
        } catch {
            # Not up yet - expected while it boots.
        }
        Start-Sleep -Milliseconds 750
    }
    Write-Step "$Label did not answer on $HealthPort within ${TimeoutSeconds}s" 'Yellow'
    return $false
}

# --- staleness check --------------------------------------------------------
# Prod serves compiled bundles, so it needs a build - but rebuilding on every
# quick-start would cost minutes. Build only when a bundle is missing or older
# than the newest source file.
function Test-BuildStale {
    $serverBundle = Join-Path $Root 'apps\server\dist\index.js'
    $uiBundle     = Join-Path $Root 'apps\ui\dist\index.html'
    if (-not (Test-Path $serverBundle) -or -not (Test-Path $uiBundle)) { return $true }

    $oldestBuild = @(
        (Get-Item $serverBundle).LastWriteTimeUtc,
        (Get-Item $uiBundle).LastWriteTimeUtc
    ) | Sort-Object | Select-Object -First 1

    $sourceRoots = @('apps\server\src', 'apps\ui\src', 'libs') |
        ForEach-Object { Join-Path $Root $_ } |
        Where-Object { Test-Path $_ }

    foreach ($sourceRoot in $sourceRoots) {
        $newest = Get-ChildItem -LiteralPath $sourceRoot -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '\\(dist|node_modules)\\' } |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1
        if ($newest -and $newest.LastWriteTimeUtc -gt $oldestBuild) { return $true }
    }
    return $false
}

function Invoke-Npm([string[]]$NpmArgs, [string]$What) {
    # Windows PowerShell 5.1 wraps a native command's stderr in an ErrorRecord,
    # which $ErrorActionPreference = 'Stop' then treats as terminating. npm and
    # vite both write ordinary progress to stderr, so under 'Stop' a perfectly
    # good build aborts the launcher. Judge these by their exit code instead --
    # the preference is function-scoped, so the rest of the script keeps 'Stop'.
    $ErrorActionPreference = 'Continue'
    & npm @NpmArgs
    if ($LASTEXITCODE -ne 0) { throw "$What failed (npm exited $LASTEXITCODE)" }
}

function Invoke-Build {
    Write-Step 'Building shared packages...' 'Yellow'
    Invoke-Npm @('run', 'build:packages') 'build:packages'

    Write-Step 'Building server...' 'Yellow'
    Invoke-Npm @('run', 'build', '--workspace=apps/server') 'server build'

    # The UI bakes its backend URL in at build time, so the prod bundle has to be
    # built with the prod server's URL in the environment.
    Write-Step 'Building UI...' 'Yellow'
    $env:VITE_SERVER_URL = "http://localhost:$ProdServerPort"
    try {
        Invoke-Npm @('run', 'build', '--workspace=apps/ui') 'UI build'
    }
    finally {
        Remove-Item 'env:VITE_SERVER_URL' -ErrorAction SilentlyContinue
    }

    Write-Step 'Build complete' 'Green'
}

# --- process launchers ------------------------------------------------------
function Start-Runner {
    Clear-DMakerEnv
    $env:DMAKER_ROLE            = 'runner'
    $env:DMAKER_ENV             = 'prod'
    $env:DMAKER_SELF_PROJECT    = $Root
    $env:DMAKER_LAUNCHER_MANAGED = 'true'
    $env:DATA_DIR               = Join-Path $Root 'data'
    $env:PORT                   = "$RunnerPort"
    # Runs from TypeScript source on purpose: rebuilding dist during Update Prod
    # must not disturb the process that is carrying running features.
    return Start-Tracked 'runner' @('run', 'runner')
}

function Start-ProdServer {
    Clear-DMakerEnv
    $env:DMAKER_ROLE            = 'app'
    $env:DMAKER_ENV             = 'prod'
    $env:DMAKER_READ_ONLY       = 'false'
    $env:DMAKER_SELF_PROJECT    = $Root
    $env:DMAKER_LAUNCHER_MANAGED = 'true'
    $env:DMAKER_RUNNER_URL      = $RunnerUrl
    $env:DMAKER_SELF_URL        = $ProdUiUrl
    $env:DMAKER_PEER_URL        = $DevUiUrl
    $env:DATA_DIR               = Join-Path $Root 'data'
    $env:PORT                   = "$ProdServerPort"
    # Carried so an Update Prod rebuild bakes the same backend URL into the bundle.
    $env:VITE_SERVER_URL        = "http://localhost:$ProdServerPort"
    return Start-Tracked 'prod server' @('run', 'start', '--workspace=apps/server')
}

function Start-ProdUi {
    Clear-DMakerEnv
    $env:VITE_SERVER_URL = "http://localhost:$ProdServerPort"
    return Start-Tracked 'prod UI' @(
        'run', 'preview', '--workspace=apps/ui', '--', '--port', "$ProdUiPort", '--strictPort'
    )
}

function Start-DevServer {
    Clear-DMakerEnv
    $env:DMAKER_ROLE            = 'app'
    $env:DMAKER_ENV             = 'dev'
    # The whole point of the dev half: look and edit, never execute.
    $env:DMAKER_READ_ONLY       = 'true'
    $env:DMAKER_SELF_PROJECT    = $Root
    $env:DMAKER_LAUNCHER_MANAGED = 'true'
    $env:DMAKER_SELF_URL        = $DevUiUrl
    $env:DMAKER_PEER_URL        = $ProdUiUrl
    # Same data directory as prod on purpose: one project list, one set of
    # tasks, whichever half you are looking at. Dev cannot rewrite the shared
    # registry - the server drops those fields for a read-only environment -
    # so a second live server here cannot cost you a project list.
    $env:DATA_DIR               = Join-Path $Root 'data'
    $env:PORT                   = "$DevServerPort"
    return Start-Tracked 'dev server' @('run', '_dev:server')
}

function Start-DevUi {
    Clear-DMakerEnv
    $env:TEST_PORT       = "$DevUiPort"
    $env:VITE_SERVER_URL = "http://localhost:$DevServerPort"
    $env:VITE_APP_MODE   = '1'
    return Start-Tracked 'dev UI' @('run', '_dev:web')
}

# ============================================================================
# Main
# ============================================================================
try {
    if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
        Write-Step 'Installing dependencies (first run)...' 'Yellow'
        Invoke-Npm @('install') 'npm install'
    }

    # data-dev/ is dev's own store; create it up front so the first boot doesn't
    # race two services trying to make it.
    $devDataDir = Join-Path $Root 'data-dev'
    if (-not (Test-Path $devDataDir)) { New-Item -ItemType Directory -Path $devDataDir | Out-Null }

    if ($SkipBuild) {
        Write-Step 'Skipping build (-SkipBuild)' 'Yellow'
    } elseif ($ForceBuild -or (Test-BuildStale)) {
        Invoke-Build
    } else {
        Write-Step 'Prod bundles are up to date - skipping build' 'Green'
    }

    Write-Host ''
    Write-Host '  DMaker' -ForegroundColor Cyan
    Write-Host "    prod    $ProdUiUrl  ->  server $ProdServerPort   (runs tasks)" -ForegroundColor Green
    Write-Host "    dev     $DevUiUrl  ->  server $DevServerPort   (read-only)" -ForegroundColor Yellow
    Write-Host "    runner  $RunnerUrl                    (owns execution)" -ForegroundColor DarkGray
    Write-Host ''

    $runner = Start-Runner
    [void](Wait-ForHealth $RunnerPort 'runner')

    $prodServer      = Start-ProdServer
    $prodServerEntry = $Started[$Started.Count - 1]
    [void](Wait-ForHealth $ProdServerPort 'prod server')

    $prodUi = Start-ProdUi
    $devServer = Start-DevServer
    $devUi = Start-DevUi

    Write-Host ''
    Write-Step "Open $ProdUiUrl to run tasks, $DevUiUrl to browse read-only." 'Cyan'
    Write-Step 'Ctrl+C (or stop.ps1) shuts the whole set down.' 'DarkGray'
    Write-Host ''

    # --- supervisor ---------------------------------------------------------
    # Only the prod server is restartable, and only it exits 75 - that is the
    # signal Update Prod sends after it has pulled and rebuilt. Everything else
    # exiting means the set is done.
    $RestartExitCode = 75
    $crashRestarts = 0
    $maxCrashRestarts = 3

    while ($true) {
        Start-Sleep -Seconds 2

        if ($prodServer.HasExited) {
            $code = $prodServer.ExitCode
            $Started.Remove($prodServerEntry)

            if ($code -eq $RestartExitCode) {
                Write-Step 'Update Prod finished - restarting prod on the new build...' 'Cyan'
                $crashRestarts = 0

                # The bundle on disk changed underneath it, so the static server
                # is cycled too; the browser reloads once health comes back.
                $prodUiEntry = $Started | Where-Object { $_.Label -eq 'prod UI' } | Select-Object -First 1
                if ($prodUiEntry) {
                    Stop-Tracked $prodUiEntry
                    $Started.Remove($prodUiEntry)
                }

                $prodServer = Start-ProdServer
                $prodServerEntry = $Started[$Started.Count - 1]
                [void](Wait-ForHealth $ProdServerPort 'prod server')
                $prodUi = Start-ProdUi
                Write-Step "Prod is back on $ProdUiUrl" 'Green'
                continue
            }

            if ($crashRestarts -lt $maxCrashRestarts) {
                $crashRestarts++
                Write-Step "Prod server exited with code $code - restarting ($crashRestarts/$maxCrashRestarts)" 'Yellow'
                $prodServer = Start-ProdServer
                $prodServerEntry = $Started[$Started.Count - 1]
                [void](Wait-ForHealth $ProdServerPort 'prod server')
                continue
            }

            Write-Step "Prod server keeps exiting (code $code). Giving up." 'Red'
            break
        }

        if ($runner.HasExited) {
            Write-Step "Runner exited with code $($runner.ExitCode) - shutting down." 'Red'
            break
        }
        if ($devServer.HasExited -and $devUi.HasExited) {
            Write-Step 'Dev half has exited - shutting down.' 'Yellow'
            break
        }
        if ($prodUi.HasExited) {
            Write-Step 'Prod UI exited - shutting down.' 'Yellow'
            break
        }
    }
}
finally {
    Write-Step 'Stopping DMaker...' 'DarkGray'
    # Reverse order: UIs first, runner last, so in-flight work gets the longest
    # possible grace before its owner goes away.
    for ($i = $Started.Count - 1; $i -ge 0; $i--) {
        Stop-Tracked $Started[$i]
    }
    Clear-DMakerEnv
    if ($ownsMutex) { try { $mutex.ReleaseMutex() } catch {} }
    $mutex.Dispose()
}
