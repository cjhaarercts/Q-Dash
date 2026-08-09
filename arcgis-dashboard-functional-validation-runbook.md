# ArcGIS Dashboard Functional Validation Runbook (DSH-07)

## Purpose

Provide a repeatable functional validation run for DSH-03 through DSH-06 and produce evidence artifacts required for DSH-07 completion.

## Automated Checks

The functional validator orchestrates these scripts:

- `dashboard:validate-contract`
- `dashboard:validate-summary-cards`
- `dashboard:validate-heatmap`
- `dashboard:validate-hazard-comparison`
- `dashboard:validate-drilldown-trace`

## Inputs

Run with payload files that represent one active event scope:

- Summary payload (who/what/where/how-many)
- Hazard comparison payload
- Drill-down and trace payload

## Command

```powershell
npm run dashboard:validate-functional -- \
  --summary infra/terraform/reports/dashboard-summary-sample-response.json \
  --hazard infra/terraform/reports/dashboard-hazard-comparison-sample-response.json \
  --drilldown infra/terraform/reports/dashboard-drilldown-trace-sample-response.json \
  --callback-latency-seconds 900
```

## Output Artifacts

The orchestrator writes two artifacts under `infra/terraform/reports`:

- `dashboard-functional-validation-<timestamp>.json`
- `dashboard-functional-validation-<timestamp>.md`

Artifacts include:

- validator pass/fail matrix
- acceptance-check status mapping
- defect/open-item list
- generation timestamp

## Acceptance Mapping

- Event totals reconcile with district totals after deconfliction:
  pass requires `dashboard:validate-summary-cards` success.
- Multi-hazard totals never exceed raw sum without explicit overlap warning:
  pass requires `dashboard:validate-hazard-comparison` success.
- Callback-driven Everbridge updates appear in drill-down within expected latency:
  pass requires `dashboard:validate-drilldown-trace` success and trace latency within threshold.
  If latency evidence is unavailable in payload, status is marked `needs-manual-verification`.

## DSH-07 Exit Checklist

- Functional validation command executes successfully.
- JSON and Markdown evidence artifacts are generated.
- Any failed check is listed in defects/open-items.
- Manual-only checks are explicitly marked for operator follow-up.
