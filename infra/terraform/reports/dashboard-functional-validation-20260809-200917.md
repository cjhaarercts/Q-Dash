# Dashboard Functional Validation Report

- Generated UTC: 2026-08-09T20:09:17.370Z
- Overall status: pass-with-open-items

## Validator Results

| Validator | Status | Payload |
| --- | --- | --- |
| contract-summary | pass | infra/terraform/reports/dashboard-summary-sample-response.json |
| summary-cards | pass | infra/terraform/reports/dashboard-summary-sample-response.json |
| heat-map | pass | infra/terraform/reports/dashboard-summary-sample-response.json |
| contract-hazard | pass | infra/terraform/reports/dashboard-hazard-comparison-sample-response.json |
| hazard-comparison | pass | infra/terraform/reports/dashboard-hazard-comparison-sample-response.json |
| contract-drilldown | pass | infra/terraform/reports/dashboard-drilldown-trace-sample-response.json |
| drilldown-trace | pass | infra/terraform/reports/dashboard-drilldown-trace-sample-response.json |

## Acceptance Checks

| Check | Status | Details |
| --- | --- | --- |
| Event totals reconcile with district totals after deconfliction | pass | Summary reconciliation validator passed. |
| Multi-hazard totals stay within raw sums unless overlap warning rules apply | pass | Hazard comparison validator passed. |
| Callback-driven Everbridge updates appear in drill-down within expected latency | needs-manual-verification | No notificationTrace.callbackSyncLatencySeconds values were provided. |
| Drill-down and trace linkage consistency | pass | Drill-down and trace validator passed. |

## Defects And Open Items

- Open item: Callback-driven Everbridge updates appear in drill-down within expected latency (No notificationTrace.callbackSyncLatencySeconds values were provided.)

