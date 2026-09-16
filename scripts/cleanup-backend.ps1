[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeStatePath = Join-Path $projectDir '.lp-backend-runtime.json'
$vinextLockPath = Join-Path $projectDir '.vinext\dev\lock.json'

function Get-ProcessSafely([int]$processId) {
  return Get-Process -Id $processId -ErrorAction SilentlyContinue
}

function Stop-RecordedProcess([int]$processId, [long]$startedAt, [string]$label) {
  if ($processId -le 0) { return }
  $target = Get-ProcessSafely $processId
  if ($null -eq $target) { return }

  # Windows can reuse PIDs. Kill only when the creation time matches the record.
  if ($startedAt -gt 0) {
    $recordedUtc = [DateTimeOffset]::FromUnixTimeMilliseconds($startedAt).UtcDateTime
    $actualUtc = $target.StartTime.ToUniversalTime()
    if ([Math]::Abs(($actualUtc - $recordedUtc).TotalSeconds) -gt 90) {
      Write-Warning "Skipping PID $processId because it has been reused."
      return
    }
  }

  Write-Host "Cleaning stale $label process (PID $processId)..." -ForegroundColor Yellow
  Start-Process -FilePath "$env:SystemRoot\System32\taskkill.exe" -ArgumentList @('/PID', $processId, '/T', '/F') -WindowStyle Hidden -Wait | Out-Null
  Start-Sleep -Milliseconds 180
  if ($null -ne (Get-ProcessSafely $processId)) {
    throw "Unable to stop stale $label process (PID $processId)."
  }
}

function Stop-ProjectListener([int]$port, [string]$label) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $processId = [int]$listener.OwningProcess
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    if ($null -eq $info) { continue }
    $commandLine = [string]$info.CommandLine
    $belongsToProject = $commandLine.IndexOf($projectDir, [StringComparison]::OrdinalIgnoreCase) -ge 0
    $legacyPrediction = $port -eq 3099 -and $commandLine -match '(?i)(^|\s|[\\/])prediction-server\.mjs(\s|$)'
    if (-not $belongsToProject -and -not $legacyPrediction) { continue }
    Write-Host "Releasing project port $port ($label, PID $processId)..." -ForegroundColor Yellow
    Start-Process -FilePath "$env:SystemRoot\System32\taskkill.exe" -ArgumentList @('/PID', $processId, '/T', '/F') -WindowStyle Hidden -Wait | Out-Null
    Start-Sleep -Milliseconds 180
    if ($null -ne (Get-ProcessSafely $processId)) {
      throw "Unable to release project port $port ($label, PID $processId)."
    }
  }
}

if (Test-Path -LiteralPath $runtimeStatePath) {
  $runtimeState = $null
  try {
    $runtimeState = Get-Content -Raw -LiteralPath $runtimeStatePath | ConvertFrom-Json
  } catch {
    Write-Warning "Unable to read the previous runtime record; continuing with port checks: $($_.Exception.Message)"
  }
  foreach ($entry in @($runtimeState.processes)) {
    Stop-RecordedProcess ([int]$entry.pid) ([long]$entry.startedAt) ([string]$entry.label)
  }
  Remove-Item -LiteralPath $runtimeStatePath -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $vinextLockPath) {
  $lock = $null
  try {
    $lock = Get-Content -Raw -LiteralPath $vinextLockPath | ConvertFrom-Json
  } catch {
    Write-Warning "Unable to inspect the Vinext lock: $($_.Exception.Message)"
  }
  if ($null -ne $lock) {
    $lockProject = [System.IO.Path]::GetFullPath([string]$lock.cwd)
    if ($lockProject -ieq $projectDir) {
      Stop-RecordedProcess ([int]$lock.pid) ([long]$lock.startedAt) 'web server'
      Remove-Item -LiteralPath $vinextLockPath -Force -ErrorAction SilentlyContinue
    }
  }
}

# Compatibility fallback for old launches that did not write a runtime record.
Stop-ProjectListener 3000 'web server'
Stop-ProjectListener 3099 'prediction server'

exit 0
