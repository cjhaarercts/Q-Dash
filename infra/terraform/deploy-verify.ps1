param(
  [ValidateSet("dev", "test", "prod")]
  [string]$Environment = "dev",
  [string]$Region = "us-west-2",
  [string]$ApplicationName = "sitrep-int",
  [string]$ReportCsvPath = "",
  [switch]$StrictHazardSmoke,
  [int]$HazardMinUpdates = 1,
  [switch]$SkipTests,
  [switch]$SkipBootstrap,
  [switch]$SkipApply,
  [switch]$AllowApply,
  [switch]$SkipOutputChecks,
  [switch]$SkipSmokeTests,
  [switch]$SkipObservabilityChecks,
  [switch]$SkipReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$terraformDir = $PSScriptRoot
$tfvarsPath = Join-Path $terraformDir "terraform.$Environment.tfvars"
$runStartedUtc = [DateTime]::UtcNow
$reportRows = New-Object System.Collections.Generic.List[object]
$scriptFailed = $false
$scriptErrorMessage = ""
$isPromotedEnvironment = $Environment -in @("test", "prod")
$forceNoApply = $isPromotedEnvironment -and -not $AllowApply
$currentWorkspace = ""

if ([string]::IsNullOrWhiteSpace($ReportCsvPath)) {
  $reportDir = Join-Path $terraformDir "reports"
  $timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
  $ReportCsvPath = Join-Path $reportDir "deploy-verify-$Environment-$timestamp.csv"
}

function Add-ReportRow {
  param(
    [string]$Stage,
    [string]$Check,
    [string]$Status,
    [string]$Detail = ""
  )

  $reportRows.Add([pscustomobject]@{
    run_started_utc = $runStartedUtc.ToString("o")
    environment = $Environment
    region = $Region
    application = $ApplicationName
    stage = $Stage
    check = $Check
    status = $Status
    detail = $Detail
    recorded_utc = ([DateTime]::UtcNow).ToString("o")
  }) | Out-Null
}

function Write-Section {
  param([string]$Message)
  Write-Host ""
  Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Assert-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is not available on PATH."
  }
}

function Invoke-Checked {
  param(
    [string]$Command,
    [string]$Step
  )

  Write-Host "-> $Step"
  Write-Host "   $Command"
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $Step"
  }
}

function Invoke-WebhookCheck {
  param(
    [string]$Name,
    [string]$Uri,
    [hashtable]$Headers,
    [string]$Body,
    [int]$ExpectedStatus
  )

  $response = Invoke-WebRequest -Uri $Uri -Method Post -Headers $Headers -ContentType "application/json" -Body $Body -SkipHttpErrorCheck
  $status = [int]$response.StatusCode

  if ($status -ne $ExpectedStatus) {
    throw "$Name expected HTTP $ExpectedStatus but got HTTP $status. Body: $($response.Content)"
  }

  [pscustomobject]@{
    test = $Name
    status = $status
    expected = $ExpectedStatus
    pass = $true
  }
}

function Get-TerraformOutputRaw {
  param([string]$Name)

  $value = terraform -chdir="$terraformDir" output -raw $Name 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required Terraform output '$Name'. Ensure this environment workspace has been applied, or rerun with -SkipOutputChecks."
  }

  return $value.Trim()
}

try {
  Write-Section "Preflight"
  Assert-Command "terraform"
  Assert-Command "aws"
  Assert-Command "pwsh"
  Add-ReportRow -Stage "preflight" -Check "required-commands" -Status "pass" -Detail "terraform, aws, pwsh"

  if ($forceNoApply) {
    Write-Host "Safety guard active: forcing -SkipApply for environment '$Environment'. Use -AllowApply to override intentionally." -ForegroundColor Yellow
    Add-ReportRow -Stage "preflight" -Check "apply-guard" -Status "pass" -Detail "forced-skip-apply for promoted environment"
  } elseif ($isPromotedEnvironment -and $AllowApply) {
    Write-Host "Safety override accepted: terraform apply is enabled for environment '$Environment'." -ForegroundColor Yellow
    Add-ReportRow -Stage "preflight" -Check "apply-guard" -Status "pass" -Detail "allow-apply override enabled"
  } else {
    Add-ReportRow -Stage "preflight" -Check "apply-guard" -Status "pass" -Detail "no guard override required"
  }

  if (-not $SkipTests) {
    Assert-Command "npm"
    Invoke-Checked -Step "Run lint/check" -Command "Set-Location '$repoRoot'; npm run check"
    Add-ReportRow -Stage "preflight" -Check "npm-check" -Status "pass" -Detail "npm run check"
    Invoke-Checked -Step "Run tests" -Command "Set-Location '$repoRoot'; npm test"
    Add-ReportRow -Stage "preflight" -Check "npm-test" -Status "pass" -Detail "npm test"
  } else {
    Write-Host "-> Skipping npm checks/tests by request."
    Add-ReportRow -Stage "preflight" -Check "npm-checks" -Status "skipped" -Detail "-SkipTests"
  }

  if (-not $SkipBootstrap) {
    Write-Section "Secrets Bootstrap"
    Invoke-Checked -Step "Bootstrap secrets and generate tfvars" -Command "Set-Location '$repoRoot'; pwsh -File '.\infra\terraform\bootstrap-secrets.ps1' -Environment '$Environment' -Region '$Region' -ApplicationName '$ApplicationName'"
    Add-ReportRow -Stage "bootstrap" -Check "secrets-bootstrap" -Status "pass" -Detail "bootstrap-secrets.ps1"
  } else {
    Write-Host "-> Skipping secrets bootstrap by request."
    Add-ReportRow -Stage "bootstrap" -Check "secrets-bootstrap" -Status "skipped" -Detail "-SkipBootstrap"
  }

  if (-not (Test-Path $tfvarsPath)) {
    throw "Missing tfvars file: $tfvarsPath. Run bootstrap first or provide the file."
  }

  Write-Section "Terraform Provision"
  Invoke-Checked -Step "Terraform init" -Command "terraform -chdir='$terraformDir' init -input=false"
  Add-ReportRow -Stage "terraform" -Check "init" -Status "pass" -Detail "terraform init"

  $currentWorkspace = (terraform -chdir="$terraformDir" workspace show).Trim()
  if ([string]::IsNullOrWhiteSpace($currentWorkspace)) {
    throw "Unable to determine active Terraform workspace."
  }
  Add-ReportRow -Stage "terraform" -Check "workspace" -Status "pass" -Detail "active=$currentWorkspace;expected=$Environment"

  Invoke-Checked -Step "Terraform validate" -Command "terraform -chdir='$terraformDir' validate"
  Add-ReportRow -Stage "terraform" -Check "validate" -Status "pass" -Detail "terraform validate"
  Invoke-Checked -Step "Terraform plan" -Command "terraform -chdir='$terraformDir' plan -var-file='terraform.$Environment.tfvars' -input=false -no-color"
  Add-ReportRow -Stage "terraform" -Check "plan" -Status "pass" -Detail "terraform plan"

  $willApply = -not ($SkipApply -or $forceNoApply)
  if ($willApply -and $isPromotedEnvironment -and $currentWorkspace -ne $Environment) {
    throw "Terraform workspace guard failed: environment '$Environment' requires workspace '$Environment' before apply, current workspace is '$currentWorkspace'. Re-run with the correct workspace or keep apply skipped."
  }

  if (-not $willApply -and $isPromotedEnvironment -and $currentWorkspace -ne $Environment) {
    Write-Host "Workspace warning: active Terraform workspace is '$currentWorkspace' while environment is '$Environment'. Apply is currently skipped; switch workspace before any apply run." -ForegroundColor Yellow
    Add-ReportRow -Stage "terraform" -Check "workspace-guard-warning" -Status "pass" -Detail "active=$currentWorkspace;expected=$Environment;applySkipped=true"
  }

  if ($willApply) {
    Invoke-Checked -Step "Terraform apply" -Command "terraform -chdir='$terraformDir' apply -var-file='terraform.$Environment.tfvars' -input=false -auto-approve -no-color"
    Add-ReportRow -Stage "terraform" -Check "apply" -Status "pass" -Detail "terraform apply"
  } else {
    Write-Host "-> Skipping terraform apply by request."
    Add-ReportRow -Stage "terraform" -Check "apply" -Status "skipped" -Detail "-SkipApply"
  }

  if (-not $SkipOutputChecks) {
    Write-Section "Post-Deploy Outputs"
    Invoke-Checked -Step "Show key outputs" -Command "terraform -chdir='$terraformDir' output -no-color api_base_url; terraform -chdir='$terraformDir' output -no-color operational_dashboard_name; terraform -chdir='$terraformDir' output -no-color operational_alarm_names"
    $apiBaseUrl = Get-TerraformOutputRaw -Name "api_base_url"
    $dashboardName = Get-TerraformOutputRaw -Name "operational_dashboard_name"
    Add-ReportRow -Stage "outputs" -Check "api-base-url" -Status "pass" -Detail $apiBaseUrl
    Add-ReportRow -Stage "outputs" -Check "operational-dashboard-name" -Status "pass" -Detail $dashboardName
  } else {
    Write-Host "-> Skipping output checks by request."
    Add-ReportRow -Stage "outputs" -Check "key-terraform-outputs" -Status "skipped" -Detail "-SkipOutputChecks"
  }

  if (-not $SkipSmokeTests) {
    Write-Section "Smoke Tests"

    try {
      $arcSecretRaw = aws secretsmanager get-secret-value --region $Region --secret-id "/$ApplicationName/$Environment/webhooks/arcgis" --query SecretString --output text
      $evbSecretRaw = aws secretsmanager get-secret-value --region $Region --secret-id "/$ApplicationName/$Environment/webhooks/everbridge" --query SecretString --output text

      $arcSecret = ($arcSecretRaw | ConvertFrom-Json).sharedSecret
      $evbSecret = ($evbSecretRaw | ConvertFrom-Json).sharedSecret

      if (-not $arcSecret -or -not $evbSecret) {
        throw "Webhook shared secrets were not found in expected secret payload shape."
      }

      $results = @()
      $results += Invoke-WebhookCheck -Name "everbridge-unauthorized" -Uri "$apiBaseUrl/webhooks/everbridge/notification" -Headers @{ "x-everbridge-webhook-secret" = "invalid-secret" } -Body '{"notificationId":"SMOKE-1","status":"delivered"}' -ExpectedStatus 401
      $results += Invoke-WebhookCheck -Name "everbridge-auth-validation" -Uri "$apiBaseUrl/webhooks/everbridge/notification" -Headers @{ "x-everbridge-webhook-secret" = $evbSecret } -Body '{"status":"delivered"}' -ExpectedStatus 400
      $results += Invoke-WebhookCheck -Name "arcgis-unauthorized" -Uri "$apiBaseUrl/webhooks/arcgis/sitrep" -Headers @{ "x-arcgis-webhook-secret" = "invalid-secret" } -Body '{"eventId":"SMOKE-EVENT","district":"D1"}' -ExpectedStatus 401
      $results += Invoke-WebhookCheck -Name "arcgis-auth-validation" -Uri "$apiBaseUrl/webhooks/arcgis/sitrep" -Headers @{ "x-arcgis-webhook-secret" = $arcSecret } -Body '{"objectId":42}' -ExpectedStatus 400

      foreach ($result in $results) {
        Add-ReportRow -Stage "smoke-tests" -Check $result.test -Status ($(if ($result.pass) { "pass" } else { "fail" })) -Detail "status=$($result.status),expected=$($result.expected)"
      }

      $pollPayload = '{"mode":"active","windowMinutes":5}'
      $pollResultPath = Join-Path $repoRoot "tmp-everbridge-poller-orchestrator.json"
      $null = aws lambda invoke --region $Region --function-name "$ApplicationName-$Environment-everbridge-poller" --payload $pollPayload --cli-binary-format raw-in-base64-out $pollResultPath --query StatusCode --output text
      $pollBody = Get-Content $pollResultPath -Raw
      Add-ReportRow -Stage "smoke-tests" -Check "everbridge-poller-invoke" -Status "pass" -Detail $(if ($pollBody.Length -gt 180) { $pollBody.Substring(0, 180) + "..." } else { $pollBody })

      $hazardPayload = '{"mode":"active","windowMinutes":15}'
      $hazardResultPath = Join-Path $repoRoot "tmp-hazard-poller-orchestrator.json"
      $null = aws lambda invoke --region $Region --function-name "$ApplicationName-$Environment-hazard-feed-poller" --payload $hazardPayload --cli-binary-format raw-in-base64-out $hazardResultPath --query StatusCode --output text
      $hazardBody = Get-Content $hazardResultPath -Raw
      $hazardParsed = $hazardBody | ConvertFrom-Json

      if ([int]$hazardParsed.statusCode -ne 200) {
        throw "Hazard feed poller invoke returned statusCode=$($hazardParsed.statusCode). Body: $hazardBody"
      }

      if ($StrictHazardSmoke) {
        if ($HazardMinUpdates -lt 0) {
          throw "HazardMinUpdates must be zero or greater when -StrictHazardSmoke is enabled."
        }

        $hazardResponseBody = $hazardParsed.body
        if ([string]::IsNullOrWhiteSpace($hazardResponseBody)) {
          throw "Hazard feed poller response body is empty while -StrictHazardSmoke is enabled."
        }

        $hazardResponse = $hazardResponseBody | ConvertFrom-Json
        $hasMetrics = $null -ne $hazardResponse.metrics
        $hasUpdateCount = $hasMetrics -and ($null -ne $hazardResponse.metrics.totalUpdates)

        $updateCount = if ($hasUpdateCount) {
          [int]$hazardResponse.metrics.totalUpdates
        } else {
          0
        }

        if ($updateCount -lt $HazardMinUpdates) {
          throw "Hazard feed poller strict check failed: totalUpdates=$updateCount is below required minimum $HazardMinUpdates."
        }

        Add-ReportRow -Stage "smoke-tests" -Check "hazard-feed-poller-strict" -Status "pass" -Detail "totalUpdates=$updateCount;requiredMin=$HazardMinUpdates"
      } else {
        Add-ReportRow -Stage "smoke-tests" -Check "hazard-feed-poller-strict" -Status "skipped" -Detail "-StrictHazardSmoke not set"
      }

      Add-ReportRow -Stage "smoke-tests" -Check "hazard-feed-poller-invoke" -Status "pass" -Detail $(if ($hazardBody.Length -gt 180) { $hazardBody.Substring(0, 180) + "..." } else { $hazardBody })

      Write-Host "Webhook smoke test summary:"
      $results | Format-Table -AutoSize

      Write-Host "Poller invoke result snippet:"
      if ($pollBody.Length -gt 400) {
        Write-Host $pollBody.Substring(0, 400)
      } else {
        Write-Host $pollBody
      }

      Write-Host "Hazard poller invoke result snippet:"
      if ($hazardBody.Length -gt 400) {
        Write-Host $hazardBody.Substring(0, 400)
      } else {
        Write-Host $hazardBody
      }
    } catch {
      Add-ReportRow -Stage "smoke-tests" -Check "stage-execution" -Status "fail" -Detail $_.Exception.Message
      throw
    }
  } else {
    Write-Host "-> Skipping smoke tests by request."
    Add-ReportRow -Stage "smoke-tests" -Check "webhook-and-poller" -Status "skipped" -Detail "-SkipSmokeTests"
  }

  if (-not $SkipObservabilityChecks) {
    Write-Section "Observability Checks"

    try {
      $alarms = aws cloudwatch describe-alarms --region $Region --alarm-name-prefix "$ApplicationName-$Environment" --query "MetricAlarms[].AlarmName" --output json
      Write-Host "Alarm names:"
      Write-Host $alarms
      Add-ReportRow -Stage "observability" -Check "alarms-list" -Status "pass" -Detail $alarms

      Write-Host "Recent callback logs (last 5 minutes):"
      aws logs tail "/aws/lambda/$ApplicationName-$Environment-everbridge-callback" --since 5m --region $Region
      Add-ReportRow -Stage "observability" -Check "callback-log-tail" -Status "pass" -Detail "aws logs tail /aws/lambda/$ApplicationName-$Environment-everbridge-callback --since 5m"
    } catch {
      Add-ReportRow -Stage "observability" -Check "stage-execution" -Status "fail" -Detail $_.Exception.Message
      throw
    }
  } else {
    Write-Host "-> Skipping observability checks by request."
    Add-ReportRow -Stage "observability" -Check "alarm-and-log-checks" -Status "skipped" -Detail "-SkipObservabilityChecks"
  }
} catch {
  $scriptFailed = $true
  $scriptErrorMessage = $_.Exception.Message
  Add-ReportRow -Stage "run" -Check "fatal-error" -Status "fail" -Detail $scriptErrorMessage
} finally {
  $passCount = @($reportRows | Where-Object { $_.status -eq "pass" }).Count
  $failCount = @($reportRows | Where-Object { $_.status -eq "fail" }).Count
  $skippedCount = @($reportRows | Where-Object { $_.status -eq "skipped" }).Count
  $finalStatus = if ($scriptFailed -or $failCount -gt 0) { "fail" } else { "pass" }

  Add-ReportRow -Stage "summary" -Check "run-totals" -Status $finalStatus -Detail "pass=$passCount;fail=$failCount;skipped=$skippedCount"

  if (-not $SkipReport) {
    Write-Section "Report Export"
    $reportDirPath = Split-Path -Parent $ReportCsvPath
    if ($reportDirPath -and -not (Test-Path $reportDirPath)) {
      New-Item -Path $reportDirPath -ItemType Directory -Force | Out-Null
    }

    $reportRows | Export-Csv -Path $ReportCsvPath -NoTypeInformation -Encoding UTF8
    Write-Host "CSV report written to: $ReportCsvPath"

    $summaryCsvPath = $ReportCsvPath -replace "\.csv$", "-summary.csv"
    if ($summaryCsvPath -eq $ReportCsvPath) {
      $summaryCsvPath = "$ReportCsvPath-summary.csv"
    }

    @([pscustomobject]@{
      run_started_utc = $runStartedUtc.ToString("o")
      environment = $Environment
      region = $Region
      application = $ApplicationName
      final_status = $finalStatus
      pass_count = $passCount
      fail_count = $failCount
      skipped_count = $skippedCount
      detailed_report_csv = $ReportCsvPath
      recorded_utc = ([DateTime]::UtcNow).ToString("o")
    }) | Export-Csv -Path $summaryCsvPath -NoTypeInformation -Encoding UTF8

    Write-Host "Summary CSV written to: $summaryCsvPath"
  } else {
    Write-Host "-> Skipping CSV report export by request."
  }

  if ($scriptFailed) {
    Write-Section "Failed"
    Write-Host "Deployment and verification orchestration failed for environment '$Environment'." -ForegroundColor Red
  } else {
    Write-Section "Complete"
    Write-Host "Deployment and verification orchestration finished for environment '$Environment'." -ForegroundColor Green
  }
}

if ($scriptFailed) {
  throw $scriptErrorMessage
}
