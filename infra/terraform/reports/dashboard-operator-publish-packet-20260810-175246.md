# Dashboard Operator Publish Packet

- Generated UTC: 2026-08-10T17:52:46.1432276Z
- Release tag: v0.2.2
- Experience URL: https://experience.arcgis.com/experience/cb7187d831294c3281edb73fe1d40ad5
- Cutover package: .\infra\terraform\reports\dashboard-cutover-package-20260809.md
- Functional evidence JSON: .\infra\terraform\reports\dashboard-functional-validation-20260810-175245.json
- Functional evidence MD: .\infra\terraform\reports\dashboard-functional-validation-20260810-175245.md

## Manual Publish Checklist

1. Open Experience Builder for the production item.
2. Confirm the embedded dashboard URL target is the expected production dashboard item.
3. Click Save.
4. Click Publish or Republish.
5. Open the live URL and hard refresh (Ctrl+F5).

## Smoke Checks

1. Event selector required-state shows no stale totals when unset.
2. Hazard multi-select with two hazards updates map/comparison/table consistently.
3. District click updates drill-down and trace panel context.
4. Overlap risk and provisional indicators behave as expected.

## Escalation

1. Data mismatch or trace inconsistency: follow operator-runbook.md.
2. Alarm and observability anomalies: follow operational-observability.md.
3. Deployment output mismatch: follow aws-observability-verification-runbook.md.
