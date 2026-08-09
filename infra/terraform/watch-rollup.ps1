param(
  [string]$ReportsDir = "",
  [string]$WatchDir = "",
  [int]$Hours = 24
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ReportsDir {
  param([string]$BasePath)

  if ([string]::IsNullOrWhiteSpace($BasePath)) {
    return (Join-Path $PSScriptRoot "reports")
  }

  return $BasePath
}

function Resolve-WatchDir {
  param(
    [string]$Candidate,
    [string]$BaseReportsDir
  )

  if (-not [string]::IsNullOrWhiteSpace($Candidate)) {
    return $Candidate
  }

  $existing = Get-ChildItem -Path $BaseReportsDir -Directory -Filter "watch-*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

  if ($null -eq $existing) {
    throw "No watch-* directories found in $BaseReportsDir."
  }

  return $existing.FullName
}

$resolvedReportsDir = Resolve-ReportsDir -BasePath $ReportsDir
$resolvedWatchDir = Resolve-WatchDir -Candidate $WatchDir -BaseReportsDir $resolvedReportsDir

$checkpointFiles = Get-ChildItem -Path $resolvedWatchDir -File -Filter "checkpoint-*-summary.json" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTimeUtc

if (@($checkpointFiles).Count -eq 0) {
  throw "No checkpoint summary files found in $resolvedWatchDir. Run watch-checkpoint.ps1 first."
}

$windowStart = [DateTime]::UtcNow.AddHours(-1 * [Math]::Abs($Hours))
$summaries = @()

foreach ($file in $checkpointFiles) {
  $obj = Get-Content $file.FullName -Raw | ConvertFrom-Json
  $ts = [DateTime]::Parse($obj.checkpoint_utc)
  if ($ts -ge $windowStart) {
    $summaries += [pscustomobject]@{
      checkpoint_utc = $obj.checkpoint_utc
      test_alarm_state_count = [int]$obj.test_alarm_state_count
      test_insufficient_data_count = [int]$obj.test_insufficient_data_count
      prod_alarm_state_count = [int]$obj.prod_alarm_state_count
      prod_insufficient_data_count = [int]$obj.prod_insufficient_data_count
      source_file = $file.FullName
    }
  }
}

if (@($summaries).Count -eq 0) {
  throw "No checkpoint summaries are within the last $Hours hours."
}

$latest = $summaries | Sort-Object checkpoint_utc -Descending | Select-Object -First 1
$stamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$rollupJsonPath = Join-Path $resolvedWatchDir ("rollup-{0}.json" -f $stamp)
$rollupMdPath = Join-Path $resolvedWatchDir ("rollup-{0}.md" -f $stamp)

$rollup = [pscustomobject]@{
  generated_utc = [DateTime]::UtcNow.ToString("o")
  watch_directory = $resolvedWatchDir
  window_hours = $Hours
  checkpoints_in_window = @($summaries).Count
  latest_checkpoint_utc = $latest.checkpoint_utc
  latest_test_alarm_state_count = $latest.test_alarm_state_count
  latest_test_insufficient_data_count = $latest.test_insufficient_data_count
  latest_prod_alarm_state_count = $latest.prod_alarm_state_count
  latest_prod_insufficient_data_count = $latest.prod_insufficient_data_count
  any_test_alarm_during_window = @($summaries | Where-Object { $_.test_alarm_state_count -gt 0 }).Count -gt 0
  any_prod_alarm_during_window = @($summaries | Where-Object { $_.prod_alarm_state_count -gt 0 }).Count -gt 0
}

$rollup | ConvertTo-Json -Depth 5 | Out-File -FilePath $rollupJsonPath -Encoding utf8

$lines = @()
$lines += "# Watch Rollup"
$lines += ""
$lines += "- Generated UTC: $($rollup.generated_utc)"
$lines += "- Watch directory: $($rollup.watch_directory)"
$lines += "- Window hours: $($rollup.window_hours)"
$lines += "- Checkpoints in window: $($rollup.checkpoints_in_window)"
$lines += "- Latest checkpoint UTC: $($rollup.latest_checkpoint_utc)"
$lines += "- Latest test alarms in ALARM: $($rollup.latest_test_alarm_state_count)"
$lines += "- Latest prod alarms in ALARM: $($rollup.latest_prod_alarm_state_count)"
$lines += "- Any test ALARM during window: $($rollup.any_test_alarm_during_window)"
$lines += "- Any prod ALARM during window: $($rollup.any_prod_alarm_during_window)"
$lines += ""
$lines += "## Checkpoint Timeline"
$lines += ""
$lines += "| checkpoint_utc | test_alarm | test_insufficient | prod_alarm | prod_insufficient |"
$lines += "| --- | ---: | ---: | ---: | ---: |"

foreach ($row in ($summaries | Sort-Object checkpoint_utc)) {
  $lines += "| $($row.checkpoint_utc) | $($row.test_alarm_state_count) | $($row.test_insufficient_data_count) | $($row.prod_alarm_state_count) | $($row.prod_insufficient_data_count) |"
}

$lines | Out-File -FilePath $rollupMdPath -Encoding utf8

Write-Host "Rollup complete." -ForegroundColor Green
Write-Host "JSON: $rollupJsonPath"
Write-Host "Markdown: $rollupMdPath"
$rollup | Format-List
