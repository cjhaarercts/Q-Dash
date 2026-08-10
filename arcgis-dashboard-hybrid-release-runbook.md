# ArcGIS Dashboard Hybrid Release Runbook

## Purpose

Provide a 90 percent automated release flow with a one-click manual ArcGIS publish step.

This runbook automates these release stages:

- Stage 2: preflight readiness gate
- Stage 3: functional validation and evidence generation
- Stage 4: operator publish packet generation
- Stage 6: post-publish URL verification and release summary artifact

## Script

- `infra/terraform/run-dashboard-hybrid-release.ps1`

## Default Inputs

- Release tag: `v0.2.2`
- Summary payload: `infra/terraform/reports/dashboard-summary-sample-response.json`
- Hazard payload: `infra/terraform/reports/dashboard-hazard-comparison-sample-response.json`
- Drilldown payload: `infra/terraform/reports/dashboard-drilldown-trace-sample-response.json`
- Callback latency threshold: `900` seconds

## One-Command Run

```powershell
npm run dashboard:release:hybrid -- -ReleaseTag v0.2.2
```

Optional explicit live URL override:

```powershell
npm run dashboard:release:hybrid -- -ReleaseTag v0.2.2 -LiveUrl "https://experience.arcgis.com/experience/cb7187d831294c3281edb73fe1d40ad5"
```

## What The Script Produces

Artifacts are written to `infra/terraform/reports`:

- `dashboard-operator-publish-packet-<timestamp>.md`
- `dashboard-hybrid-release-<timestamp>.json`
- `dashboard-hybrid-release-<timestamp>.md`

The script also reuses existing outputs from `dashboard:validate-functional`:

- `dashboard-functional-validation-<timestamp>.json`
- `dashboard-functional-validation-<timestamp>.md`

## Manual Publish Step

After the script completes stage 4:

1. Open the Experience Builder item.
2. Confirm embedded dashboard URL target.
3. Save.
4. Publish or Republish.

Then stage 6 checks the live URL response and records post-publish evidence.

## Failure Behavior

The script exits non-zero when:

- preflight readiness fails
- functional validation fails
- live URL check fails

## Notes

- `dashboard:cutover:ready` includes a clean-worktree gate and release-tag-on-HEAD gate.
- Use `-SkipCutoverReady` only for local script development or dry runs.
