param(
  [string]$Region = "us-west-2",
  [string]$ApplicationName = "sitrep-int",
  [string]$ReportsDir = "",
  [string]$WatchDir = "",
  [string]$LogSince = "120m"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not available on PATH."
  }
}

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

  if ($null -ne $existing) {
    return $existing.FullName
  }

  $newDir = Join-Path $BaseReportsDir ("watch-{0}" -f ([DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")))
  New-Item -Path $newDir -ItemType Directory -Force | Out-Null
  return $newDir
}

function Get-AlarmCount {
  param(
    [object[]]$MetricAlarms,
    [string]$State
  )

  return @($MetricAlarms | Where-Object { $_.StateValue -eq $State }).Count
}

Assert-Command "aws"

$resolvedReportsDir = Resolve-ReportsDir -BasePath $ReportsDir
if (-not (Test-Path $resolvedReportsDir)) {
  New-Item -Path $resolvedReportsDir -ItemType Directory -Force | Out-Null
}

$resolvedWatchDir = Resolve-WatchDir -Candidate $WatchDir -BaseReportsDir $resolvedReportsDir
if (-not (Test-Path $resolvedWatchDir)) {
  New-Item -Path $resolvedWatchDir -ItemType Directory -Force | Out-Null
}

$stamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")

$testAlarmPath = Join-Path $resolvedWatchDir ("checkpoint-{0}-alarms-test.json" -f $stamp)
$prodAlarmPath = Join-Path $resolvedWatchDir ("checkpoint-{0}-alarms-prod.json" -f $stamp)
$testDashPath = Join-Path $resolvedWatchDir ("checkpoint-{0}-dashboard-test.json" -f $stamp)
$prodDashPath = Join-Path $resolvedWatchDir ("checkpoint-{0}-dashboard-prod.json" -f $stamp)
$prodCallbackLogPath = Join-Path $resolvedWatchDir ("checkpoint-{0}-prod-everbridge-callback.log" -f $stamp)
$prodEverbridgePollerLogPath = Join-Path $resolvedWatchDir ("checkpoint-{0}-prod-everbridge-poller.log" -f $stamp)
$prodHazardPollerLogPath = Join-Path $resolvedWatchDir ("checkpoint-{0}-prod-hazard-feed-poller.log" -f $stamp)
$summaryPath = Join-Path $resolvedWatchDir ("checkpoint-{0}-summary.json" -f $stamp)
$historyPath = Join-Path $resolvedWatchDir "watch-history.csv"

$null = aws cloudwatch describe-alarms --region $Region --alarm-name-prefix "$ApplicationName-test" --output json > $testAlarmPath
$null = aws cloudwatch describe-alarms --region $Region --alarm-name-prefix "$ApplicationName-prod" --output json > $prodAlarmPath
$null = aws cloudwatch get-dashboard --region $Region --dashboard-name "$ApplicationName-test-operational" --output json > $testDashPath
$null = aws cloudwatch get-dashboard --region $Region --dashboard-name "$ApplicationName-prod-operational" --output json > $prodDashPath

try {
  $null = aws logs tail "/aws/lambda/$ApplicationName-prod-everbridge-callback" --since $LogSince --region $Region > $prodCallbackLogPath
} catch {
  "Failed to retrieve logs: $($_.Exception.Message)" | Out-File -FilePath $prodCallbackLogPath -Encoding utf8
}

try {
  $null = aws logs tail "/aws/lambda/$ApplicationName-prod-everbridge-poller" --since $LogSince --region $Region > $prodEverbridgePollerLogPath
} catch {
  "Failed to retrieve logs: $($_.Exception.Message)" | Out-File -FilePath $prodEverbridgePollerLogPath -Encoding utf8
}

try {
  $null = aws logs tail "/aws/lambda/$ApplicationName-prod-hazard-feed-poller" --since $LogSince --region $Region > $prodHazardPollerLogPath
} catch {
  "Failed to retrieve logs: $($_.Exception.Message)" | Out-File -FilePath $prodHazardPollerLogPath -Encoding utf8
}

$testObj = Get-Content $testAlarmPath -Raw | ConvertFrom-Json
$prodObj = Get-Content $prodAlarmPath -Raw | ConvertFrom-Json

$testMetricAlarms = @($testObj.MetricAlarms)
$prodMetricAlarms = @($prodObj.MetricAlarms)

$summary = [pscustomobject]@{
  checkpoint_utc = [DateTime]::UtcNow.ToString("o")
  watch_directory = $resolvedWatchDir
  region = $Region
  application = $ApplicationName
  log_since = $LogSince
  test_metric_alarm_count = $testMetricAlarms.Count
  test_alarm_state_count = Get-AlarmCount -MetricAlarms $testMetricAlarms -State "ALARM"
  test_insufficient_data_count = Get-AlarmCount -MetricAlarms $testMetricAlarms -State "INSUFFICIENT_DATA"
  test_alarm_names_in_alarm = @($testMetricAlarms | Where-Object { $_.StateValue -eq "ALARM" } | Select-Object -ExpandProperty AlarmName)
  prod_metric_alarm_count = $prodMetricAlarms.Count
  prod_alarm_state_count = Get-AlarmCount -MetricAlarms $prodMetricAlarms -State "ALARM"
  prod_insufficient_data_count = Get-AlarmCount -MetricAlarms $prodMetricAlarms -State "INSUFFICIENT_DATA"
  prod_alarm_names_in_alarm = @($prodMetricAlarms | Where-Object { $_.StateValue -eq "ALARM" } | Select-Object -ExpandProperty AlarmName)
  test_alarms_file = $testAlarmPath
  prod_alarms_file = $prodAlarmPath
  test_dashboard_file = $testDashPath
  prod_dashboard_file = $prodDashPath
  prod_callback_logs_file = $prodCallbackLogPath
  prod_everbridge_poller_logs_file = $prodEverbridgePollerLogPath
  prod_hazard_poller_logs_file = $prodHazardPollerLogPath
}

$summary | ConvertTo-Json -Depth 6 | Out-File -FilePath $summaryPath -Encoding utf8

$historyRow = [pscustomobject]@{
  checkpoint_utc = $summary.checkpoint_utc
  test_metric_alarm_count = $summary.test_metric_alarm_count
  test_alarm_state_count = $summary.test_alarm_state_count
  test_insufficient_data_count = $summary.test_insufficient_data_count
  prod_metric_alarm_count = $summary.prod_metric_alarm_count
  prod_alarm_state_count = $summary.prod_alarm_state_count
  prod_insufficient_data_count = $summary.prod_insufficient_data_count
  summary_file = $summaryPath
}

if (Test-Path $historyPath) {
  $historyRow | Export-Csv -Path $historyPath -NoTypeInformation -Encoding UTF8 -Append
} else {
  $historyRow | Export-Csv -Path $historyPath -NoTypeInformation -Encoding UTF8
}

Write-Host "Checkpoint complete." -ForegroundColor Green
Write-Host "Summary file: $summaryPath"
$summary | Format-List
