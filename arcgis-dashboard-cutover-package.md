# ArcGIS Dashboard Phase 1 Cutover Package (DSH-08)

## Purpose

Provide a standard handoff package for publishing the Phase 1 ArcGIS leadership dashboard.

## Required Package Contents

- Dashboard URL
- Data source inventory
- Filter definitions
- Known constraints
- Operator quick checks
- Escalation instructions
- Validation evidence links

## Package Template

### 1. Release Metadata

- Release ID: `<release-id>`
- Environment: `<test|prod>`
- Release date (UTC): `<yyyy-mm-ddThh:mm:ssZ>`
- Prepared by: `<name>`
- Approved by: `<name>`

### 2. Dashboard Access

- Dashboard URL: `<arcgis-dashboard-url>`
- Event scope: `event_id` required
- Audience: leadership and operations watchers

### 3. Data Sources

- Leadership visualization contract endpoint/view
- District polygon layer for heat map
- District drill-down dataset (`districtDetails`)
- Notification trace dataset (`notificationTrace`)

### 4. Filter Definitions

- Event selector: required single-select
- Hazard selector: multi-select
- District selector: multi-select
- Confidence selector: multi-select (`potential`, `reported`, `confirmed`)
- Time-window selector: single-select (`6h`, `12h`, `24h`, `72h`)

### 5. Known Constraints

- Combined multi-hazard totals depend on overlap deconfliction availability.
- When deconfliction is unavailable, totals are marked provisional.
- Callback latency verification may require CloudWatch evidence when payload latency fields are not present.

### 6. Operator Quick Checks

- Confirm event selector is required and empty-state does not show stale totals.
- Confirm summary counts reconcile with district roll-up.
- Confirm heat map metric toggle and bucket legend render correctly.
- Confirm hazard comparison supports combined and per-hazard views.
- Confirm district click updates drill-down and trace panel.
- Confirm overlap/provisional indicators are visible when applicable.

### 7. Escalation Instructions

- Data mismatch or missing correlation:
  - follow `operator-runbook.md` leadership and observability workflows.
- Repeating missing-event-correlation or duplicate-suppression alarms:
  - follow `operational-observability.md` signal classification and escalation guidance.
- Deployment drift or alarm configuration mismatch:
  - follow `aws-observability-verification-runbook.md` output checks and reconciliation steps.

### 8. Validation Evidence

- Functional validation JSON report path
- Functional validation Markdown report path
- Additional screenshots and operator notes

## Exit Criteria

- Package includes all required sections.
- Validation evidence is attached and readable.
- Approver and release metadata are complete.
