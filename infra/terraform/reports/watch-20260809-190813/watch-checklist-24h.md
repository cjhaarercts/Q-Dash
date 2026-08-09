# 24-Hour Post-Promotion Watch Checklist

Generated UTC: 2026-08-09T19:08:28.8386424Z
Region: us-west-2
Application: sitrep-int

## Baseline Snapshot

- Test metric alarms: 4
- Test alarms in ALARM: 0
- Test alarms in INSUFFICIENT_DATA: 0
- Prod metric alarms: 5
- Prod alarms in ALARM: 0
- Prod alarms in INSUFFICIENT_DATA: 0

Reference snapshot files in this folder:

- alarms-test.json
- alarms-prod.json
- dashboard-test.json
- dashboard-prod.json
- watch-summary.json

## Watch Windows

- T+0h (now)
  - Verify all test/prod alarms are in OK or expected idle state.
  - Confirm both dashboards load and render hazard + Everbridge widgets.
- T+2h
  - Re-run alarm state check for test and prod.
  - Confirm no new missing-event-correlation alarm transitions.
- T+6h
  - Re-run alarm state check for test and prod.
  - Check duplicate suppression trends are stable and non-repeating.
- T+12h
  - Re-run alarm state check for test and prod.
  - Confirm callback and poller logs are flowing without repeated errors.
- T+24h
  - Final alarm state check for test and prod.
  - Capture closing summary and declare watch complete if no critical anomalies.

## Fast Commands

```powershell
# Alarm states (test)
aws cloudwatch describe-alarms --region us-west-2 --alarm-name-prefix sitrep-int-test --query "MetricAlarms[].{Name:AlarmName,State:StateValue,Updated:StateUpdatedTimestamp}" --output table

# Alarm states (prod)
aws cloudwatch describe-alarms --region us-west-2 --alarm-name-prefix sitrep-int-prod --query "MetricAlarms[].{Name:AlarmName,State:StateValue,Updated:StateUpdatedTimestamp}" --output table

# Recent callback logs (prod)
aws logs tail "/aws/lambda/sitrep-int-prod-everbridge-callback" --since 60m --region us-west-2

# Recent poller logs (prod)
aws logs tail "/aws/lambda/sitrep-int-prod-everbridge-poller" --since 60m --region us-west-2
aws logs tail "/aws/lambda/sitrep-int-prod-hazard-feed-poller" --since 60m --region us-west-2
```

## Escalation Triggers

- Any prod alarm enters ALARM for missing-event-correlation and persists across two consecutive checks.
- Repeated duplicate-suppression alarms indicating replay, schedule overlap, or dedup regression.
- Callback/poller log failures repeating in 3+ consecutive invocations.
- Dashboard widgets missing or stale for more than one watch interval.
