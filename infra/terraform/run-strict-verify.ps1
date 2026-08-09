param(
  [ValidateSet("dev", "test", "prod")]
  [string]$Environment = "dev",
  [string]$Region = "us-west-2",
  [string]$ApplicationName = "sitrep-int",
  [int]$HazardMinUpdates = 1,
  [switch]$SkipBootstrap,
  [switch]$SkipTests,
  [switch]$SkipApply,
  [switch]$AllowApply,
  [string]$ReportCsvPath = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$deployVerifyPath = Join-Path $scriptDir "deploy-verify.ps1"

if (-not (Test-Path $deployVerifyPath)) {
  throw "Missing deploy orchestrator script: $deployVerifyPath"
}

if ([string]::IsNullOrWhiteSpace($ReportCsvPath)) {
  $ReportCsvPath = Join-Path $scriptDir ("reports/deploy-verify-{0}-strict-live.csv" -f $Environment)
}

$isPromotedEnvironment = $Environment -in @("test", "prod")
$forceNoApply = $isPromotedEnvironment -and -not $AllowApply
$effectiveSkipApply = $SkipApply -or $forceNoApply

$commandParams = @{
  Environment        = $Environment
  Region             = $Region
  ApplicationName    = $ApplicationName
  StrictHazardSmoke  = $true
  HazardMinUpdates   = $HazardMinUpdates
  ReportCsvPath      = $ReportCsvPath
}

if ($SkipBootstrap) {
  $commandParams.SkipBootstrap = $true
}

if ($SkipTests) {
  $commandParams.SkipTests = $true
}

if ($effectiveSkipApply) {
  $commandParams.SkipApply = $true
}

if ($AllowApply) {
  $commandParams.AllowApply = $true
}

Write-Host "Running strict verification profile for environment '$Environment'..." -ForegroundColor Cyan
Write-Host "Report path: $ReportCsvPath"

if ($forceNoApply) {
  Write-Host "Safety guard active: forcing -SkipApply for environment '$Environment'. Use -AllowApply to override intentionally." -ForegroundColor Yellow
}

if ($isPromotedEnvironment -and $AllowApply) {
  Write-Host "Safety override accepted: terraform apply is enabled for environment '$Environment'." -ForegroundColor Yellow
}

& $deployVerifyPath @commandParams
