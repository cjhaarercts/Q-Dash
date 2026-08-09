param(
  [string]$Environment = "dev",
  [string]$Region = "us-west-2",
  [string]$ApplicationName = "sitrep-int",
  [string]$AlarmTopicArn = ""
)

$ErrorActionPreference = "Stop"

$secretDir = Join-Path $PSScriptRoot "secrets/$Environment"
$tfvarsPath = Join-Path $PSScriptRoot "terraform.$Environment.tfvars"

$secretDefinitions = @(
  @{
    Key = "arcgis_runtime_secret_arn"
    Name = "/$ApplicationName/$Environment/arcgis/runtime"
    File = Join-Path $secretDir "arcgis.runtime.json"
    Example = Join-Path $secretDir "arcgis.runtime.example.json"
  },
  @{
    Key = "everbridge_polling_secret_arn"
    Name = "/$ApplicationName/$Environment/everbridge/polling"
    File = Join-Path $secretDir "everbridge.polling.json"
    Example = Join-Path $secretDir "everbridge.polling.example.json"
  },
  @{
    Key = "everbridge_draft_secret_arn"
    Name = "/$ApplicationName/$Environment/everbridge/draft"
    File = Join-Path $secretDir "everbridge.draft.json"
    Example = Join-Path $secretDir "everbridge.draft.example.json"
  },
  @{
    Key = "arcgis_webhook_secret_arn"
    Name = "/$ApplicationName/$Environment/webhooks/arcgis"
    File = Join-Path $secretDir "webhook.arcgis.json"
    Example = Join-Path $secretDir "webhook.arcgis.example.json"
  },
  @{
    Key = "everbridge_webhook_secret_arn"
    Name = "/$ApplicationName/$Environment/webhooks/everbridge"
    File = Join-Path $secretDir "webhook.everbridge.json"
    Example = Join-Path $secretDir "webhook.everbridge.example.json"
  }
)

if (-not (Test-Path $secretDir)) {
  throw "Missing secrets directory: $secretDir"
}

$resolvedSecrets = @{}

foreach ($secret in $secretDefinitions) {
  if (-not (Test-Path $secret.File)) {
    throw "Missing payload file $($secret.File). Copy $($secret.Example) to $($secret.File) and fill in real values locally."
  }

  $describeOutput = $null
  try {
    $describeOutput = aws secretsmanager describe-secret --region $Region --secret-id $secret.Name 2>$null
  } catch {
    $describeOutput = $null
  }

  if ($LASTEXITCODE -eq 0 -and $describeOutput) {
    aws secretsmanager update-secret --region $Region --secret-id $secret.Name --secret-string file://$($secret.File) | Out-Null
    $secretArn = (aws secretsmanager describe-secret --region $Region --secret-id $secret.Name | ConvertFrom-Json).ARN
  } else {
    $secretArn = (aws secretsmanager create-secret --region $Region --name $secret.Name --secret-string file://$($secret.File) | ConvertFrom-Json).ARN
  }

  $resolvedSecrets[$secret.Key] = $secretArn
}

$tfvarsLines = @(
  "environment                   = `"$Environment`"",
  "aws_region                    = `"$Region`"",
  "arcgis_runtime_secret_arn     = `"$($resolvedSecrets.arcgis_runtime_secret_arn)`"",
  "everbridge_polling_secret_arn = `"$($resolvedSecrets.everbridge_polling_secret_arn)`"",
  "everbridge_draft_secret_arn   = `"$($resolvedSecrets.everbridge_draft_secret_arn)`"",
  "arcgis_webhook_secret_arn     = `"$($resolvedSecrets.arcgis_webhook_secret_arn)`"",
  "everbridge_webhook_secret_arn = `"$($resolvedSecrets.everbridge_webhook_secret_arn)`""
)

if ($AlarmTopicArn) {
  $tfvarsLines += "alarm_notification_topic_arns = [`"$AlarmTopicArn`"]"
}

Set-Content -Path $tfvarsPath -Value ($tfvarsLines -join [Environment]::NewLine)

Write-Host "Secrets bootstrapped for environment '$Environment' in region '$Region'."
Write-Host "Generated tfvars: $tfvarsPath"
Write-Host "Next command: terraform -chdir=`"$PSScriptRoot`" plan -var-file=`"terraform.$Environment.tfvars`""