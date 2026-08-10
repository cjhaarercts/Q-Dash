[CmdletBinding()]
param(
    [string]$ReleaseTag,
    [string]$SummaryPayload = "infra/terraform/reports/dashboard-summary-sample-response.json",
    [string]$HazardPayload = "infra/terraform/reports/dashboard-hazard-comparison-sample-response.json",
    [string]$DrilldownPayload = "infra/terraform/reports/dashboard-drilldown-trace-sample-response.json",
    [int]$CallbackLatencySeconds = 900,
    [string]$LiveUrl,
    [switch]$SkipCutoverReady
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-TimestampToken {
    param([datetime]$NowUtc)
    return $NowUtc.ToString("yyyyMMdd-HHmmss")
}

function Get-HeadReleaseTag {
    $tags = git tag --points-at HEAD
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect tags on HEAD."
    }

    $first = ($tags | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1)
    return $first
}

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host "[STEP] $Name" -ForegroundColor Cyan
    & $Action
}

function Invoke-CheckedCommand {
    param(
        [string]$Description,
        [string]$CommandName,
        [string[]]$ArgumentList
    )

    Write-Host "[RUN ] $Description" -ForegroundColor DarkCyan
    & $CommandName @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($Description) with exit code $LASTEXITCODE"
    }
}

function Get-LatestCutoverFile {
    param([string]$ReportsDir)

    $file = Get-ChildItem -Path $ReportsDir -Filter "dashboard-cutover-package-*.md" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $file) {
        throw "No cutover package found under $ReportsDir"
    }

    return $file.FullName
}

function Get-CutoverDashboardUrl {
    param([string]$CutoverPath)

    $line = Get-Content -Path $CutoverPath | Where-Object { $_ -like "- Dashboard URL:*" } | Select-Object -First 1
    if (-not $line) {
        throw "Dashboard URL line not found in cutover package: $CutoverPath"
    }

    $url = ($line -replace "^- Dashboard URL:\s*", "").Trim().Trim('`')
    if (-not $url) {
        throw "Dashboard URL value is empty in cutover package: $CutoverPath"
    }

    return $url
}

function Get-LatestFunctionalReports {
    param([string]$ReportsDir)

    $json = Get-ChildItem -Path $ReportsDir -Filter "dashboard-functional-validation-*.json" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    $md = Get-ChildItem -Path $ReportsDir -Filter "dashboard-functional-validation-*.md" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $json -or -not $md) {
        throw "Functional validation artifacts were not found under $ReportsDir"
    }

    return [pscustomobject]@{
        Json = $json.FullName
        Markdown = $md.FullName
    }
}

function New-OperatorPacket {
    param(
        [string]$ReportsDir,
        [string]$Token,
        [string]$ReleaseTag,
        [string]$CutoverPath,
        [string]$FunctionalJsonPath,
        [string]$FunctionalMdPath,
        [string]$LiveUrl
    )

    $packetPath = Join-Path $ReportsDir "dashboard-operator-publish-packet-$Token.md"
    $cutoverRel = Resolve-Path -LiteralPath $CutoverPath -Relative
    $jsonRel = Resolve-Path -LiteralPath $FunctionalJsonPath -Relative
    $mdRel = Resolve-Path -LiteralPath $FunctionalMdPath -Relative

    $content = @(
        "# Dashboard Operator Publish Packet"
        ""
        "- Generated UTC: $([datetime]::UtcNow.ToString('o'))"
        "- Release tag: $ReleaseTag"
        "- Experience URL: $LiveUrl"
        "- Cutover package: $cutoverRel"
        "- Functional evidence JSON: $jsonRel"
        "- Functional evidence MD: $mdRel"
        ""
        "## Manual Publish Checklist"
        ""
        "1. Open Experience Builder for the production item."
        "2. Confirm the embedded dashboard URL target is the expected production dashboard item."
        "3. Click Save."
        "4. Click Publish or Republish."
        "5. Open the live URL and hard refresh (Ctrl+F5)."
        ""
        "## Smoke Checks"
        ""
        "1. Event selector required-state shows no stale totals when unset."
        "2. Hazard multi-select with two hazards updates map/comparison/table consistently."
        "3. District click updates drill-down and trace panel context."
        "4. Overlap risk and provisional indicators behave as expected."
        ""
        "## Escalation"
        ""
        "1. Data mismatch or trace inconsistency: follow operator-runbook.md."
        "2. Alarm and observability anomalies: follow operational-observability.md."
        "3. Deployment output mismatch: follow aws-observability-verification-runbook.md."
    )

    Set-Content -Path $packetPath -Value ($content -join "`r`n") -Encoding UTF8
    return $packetPath
}

function New-ReleaseSummaryArtifacts {
    param(
        [string]$ReportsDir,
        [string]$Token,
        [string]$ReleaseTag,
        [string]$CutoverPath,
        [string]$OperatorPacketPath,
        [string]$FunctionalJsonPath,
        [string]$FunctionalMdPath,
        [string]$LiveUrl,
        [pscustomobject]$LiveCheck
    )

    $jsonPath = Join-Path $ReportsDir "dashboard-hybrid-release-$Token.json"
    $mdPath = Join-Path $ReportsDir "dashboard-hybrid-release-$Token.md"

    $payload = [ordered]@{
        generatedAtUtc = [datetime]::UtcNow.ToString("o")
        releaseTag = $ReleaseTag
        cutoverPackage = (Resolve-Path -LiteralPath $CutoverPath -Relative)
        operatorPacket = (Resolve-Path -LiteralPath $OperatorPacketPath -Relative)
        functionalEvidence = [ordered]@{
            json = (Resolve-Path -LiteralPath $FunctionalJsonPath -Relative)
            markdown = (Resolve-Path -LiteralPath $FunctionalMdPath -Relative)
        }
        liveUrlCheck = [ordered]@{
            url = $LiveUrl
            statusCode = $LiveCheck.StatusCode
            ok = $LiveCheck.Ok
            title = $LiveCheck.Title
        }
        overallStatus = if ($LiveCheck.Ok) { "pass" } else { "fail" }
    }

    $payload | ConvertTo-Json -Depth 6 | Set-Content -Path $jsonPath -Encoding UTF8

    $md = @(
        "# Dashboard Hybrid Release Summary"
        ""
        "- Generated UTC: $($payload.generatedAtUtc)"
        "- Release tag: $ReleaseTag"
        "- Overall status: $($payload.overallStatus)"
        ""
        "## Artifacts"
        ""
        "- Cutover package: $($payload.cutoverPackage)"
        "- Operator packet: $($payload.operatorPacket)"
        "- Functional evidence JSON: $($payload.functionalEvidence.json)"
        "- Functional evidence MD: $($payload.functionalEvidence.markdown)"
        ""
        "## Live URL Check"
        ""
        "- URL: $($payload.liveUrlCheck.url)"
        "- Status code: $($payload.liveUrlCheck.statusCode)"
        "- OK: $($payload.liveUrlCheck.ok)"
        "- Title: $($payload.liveUrlCheck.title)"
    )

    Set-Content -Path $mdPath -Value ($md -join "`r`n") -Encoding UTF8

    return [pscustomobject]@{
        Json = $jsonPath
        Markdown = $mdPath
        OverallStatus = $payload.overallStatus
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$reportsDir = Join-Path $repoRoot "infra\terraform\reports"
if (-not (Test-Path -Path $reportsDir)) {
    throw "Reports directory not found: $reportsDir"
}

$summaryRel = $SummaryPayload -replace "\\", "/"
$hazardRel = $HazardPayload -replace "\\", "/"
$drilldownRel = $DrilldownPayload -replace "\\", "/"

if ([string]::IsNullOrWhiteSpace($ReleaseTag)) {
    $ReleaseTag = Get-HeadReleaseTag
    if ([string]::IsNullOrWhiteSpace($ReleaseTag)) {
        throw "No release tag was provided and no tag was found on HEAD. Provide -ReleaseTag <tag>."
    }
    Write-Host "[INFO] Using HEAD tag for release gate: $ReleaseTag" -ForegroundColor DarkYellow
}

if (-not $SkipCutoverReady) {
    Invoke-Step -Name "Stage 2 - Preflight readiness gate" -Action {
        Invoke-CheckedCommand -Description "Cutover readiness check" -CommandName "npm.cmd" -ArgumentList @("run", "dashboard:cutover:ready", "--", $ReleaseTag)
    }
} else {
    Write-Host "[SKIP] Stage 2 preflight gate skipped by -SkipCutoverReady" -ForegroundColor Yellow
}

Invoke-Step -Name "Stage 3 - Functional validation and evidence generation" -Action {
    Invoke-CheckedCommand -Description "Functional validation" -CommandName "npm.cmd" -ArgumentList @(
        "run", "dashboard:validate-functional", "--",
        "--summary", $summaryRel,
        "--hazard", $hazardRel,
        "--drilldown", $drilldownRel,
        "--callback-latency-seconds", "$CallbackLatencySeconds"
    )
}

$functional = Get-LatestFunctionalReports -ReportsDir $reportsDir
$cutoverPath = Get-LatestCutoverFile -ReportsDir $reportsDir
if (-not $LiveUrl) {
    $LiveUrl = Get-CutoverDashboardUrl -CutoverPath $cutoverPath
}

$token = Get-TimestampToken -NowUtc ([datetime]::UtcNow)

Invoke-Step -Name "Stage 4 - Operator publish packet generation" -Action {
    $script:operatorPacketPath = New-OperatorPacket -ReportsDir $reportsDir -Token $token -ReleaseTag $ReleaseTag -CutoverPath $cutoverPath -FunctionalJsonPath $functional.Json -FunctionalMdPath $functional.Markdown -LiveUrl $LiveUrl
    Write-Host "[OK  ] Wrote operator packet: $((Resolve-Path -LiteralPath $script:operatorPacketPath -Relative))" -ForegroundColor Green
}

Invoke-Step -Name "Stage 6 - Post-publish live URL verification" -Action {
    $response = Invoke-WebRequest -Uri $LiveUrl -Method Get -UseBasicParsing -TimeoutSec 30
    $title = ""
    if ($response.Content -match "<title>(.*?)</title>") {
        $title = $Matches[1]
    }

    $script:liveCheck = [pscustomobject]@{
        StatusCode = [int]$response.StatusCode
        Ok = ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 400)
        Title = $title
    }

    if (-not $script:liveCheck.Ok) {
        throw "Live URL verification failed with HTTP status $($script:liveCheck.StatusCode)"
    }
}

$summary = New-ReleaseSummaryArtifacts -ReportsDir $reportsDir -Token $token -ReleaseTag $ReleaseTag -CutoverPath $cutoverPath -OperatorPacketPath $operatorPacketPath -FunctionalJsonPath $functional.Json -FunctionalMdPath $functional.Markdown -LiveUrl $LiveUrl -LiveCheck $liveCheck

Write-Host "[DONE] Hybrid release flow completed." -ForegroundColor Green
Write-Host "       Functional JSON: $((Resolve-Path -LiteralPath $functional.Json -Relative))"
Write-Host "       Functional MD:   $((Resolve-Path -LiteralPath $functional.Markdown -Relative))"
Write-Host "       Operator packet: $((Resolve-Path -LiteralPath $operatorPacketPath -Relative))"
Write-Host "       Summary JSON:    $((Resolve-Path -LiteralPath $summary.Json -Relative))"
Write-Host "       Summary MD:      $((Resolve-Path -LiteralPath $summary.Markdown -Relative))"

if ($summary.OverallStatus -ne "pass") {
    throw "Hybrid release summary status is $($summary.OverallStatus)"
}
