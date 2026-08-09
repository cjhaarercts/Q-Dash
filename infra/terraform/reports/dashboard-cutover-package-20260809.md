# Dashboard Cutover Package - 2026-08-09

## 1. Release Metadata

- Release ID: `phase1-dsh08-20260809`
- Environment: `prod`
- Release date (UTC): `2026-08-09T20:12:00Z`
- Prepared by: `automation`
- Approved by: `Chris Haarer BC-QEL National Q-Directorate`

## 2. Dashboard Access

- Dashboard URL: `https://experience.arcgis.com/experience/cb7187d831294c3281edb73fe1d40ad5`
- Event scope: `event_id` required
- Audience: leadership and operations watchers

## 3. Data Sources

- Leadership summary payload: `whoWhatWhereHowMany`
- Heat map payload: `heatMap`
- Drill-down payload: `districtDetails`
- Notification trace payload: `notificationTrace`

## 4. Filter Definitions

- Event selector: required single-select (`event_id`)
- Hazard selector: multi-select (`hazard_type`)
- District selector: multi-select (`district`)
- Confidence selector: multi-select (`potential`, `reported`, `confirmed`)
- Time-window selector: single-select (`6h`, `12h`, `24h`, `72h`)

## 5. Known Constraints

- Multi-hazard combined totals rely on overlap deconfliction.
- Provisional labeling must be visible when `overlapDeconflicted = false`.
- Callback-latency validation requires trace latency fields or CloudWatch timing evidence.

## 6. Operator Quick Checks

- Event required-state shows no stale totals when unset.
- Summary row reconciles to district totals after deconfliction.
- Heat map metric toggle works for unaccounted, needing help, and contacted.
- Hazard comparison supports combined and per-hazard views.
- District selection updates drill-down and trace panel.
- Overlap risk and provisional indicators appear when required.

## 7. Escalation Instructions

- Follow `operator-runbook.md` for leadership and incident workflows.
- Follow `operational-observability.md` for alarm interpretation and escalation.
- Follow `aws-observability-verification-runbook.md` for deployment-state and output reconciliation.

## 8. Validation Evidence

- `infra/terraform/reports/dashboard-functional-validation-20260809-201402.json`
- `infra/terraform/reports/dashboard-functional-validation-20260809-201402.md`

## 9. Open Items

- Confirm approver identity.
