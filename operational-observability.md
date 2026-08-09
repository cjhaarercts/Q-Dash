# Operational Observability Reference

## Purpose

This reference classifies the automation metrics, alarms, and dashboard views used by the SITREP integration service so operators can distinguish informational noise from conditions that need intervention.

## Core Outputs

- CloudWatch dashboard output: `operational_dashboard_name`
- Effective alarm configuration output: `operational_alarm_effective_config`
- Alarm name output map: `operational_alarm_names`

## Signal Classification

| Signal | Source path | Default operator posture | Meaning | Typical next action |
| --- | --- | --- | --- | --- |
| `HazardFeedPollSummary` | Hazard dashboard widget and logs | Informational | Aggregate per-poll hazard actions, provenance mix, and suppressions. | Use for trend review, not direct escalation. |
| `HazardMissingEventCorrelation` | Hazard dashboard widget and alarm | Action-required | Hazard feed items could not be mapped to an event and district. | Review ArcGIS lookup configuration, feed geometry, and district/event correlation rules. |
| `HazardDuplicateSuppression` | Hazard dashboard widget and optional alarm | Warning | Duplicate hazard updates were suppressed. | Check feed churn, scheduler overlap, or expected duplicate polling behavior. |
| `EverbridgePollSummary` | Everbridge dashboard widget and logs | Informational | Aggregate per-poll Everbridge processing counts and suppressions. | Use for trend review and post-incident verification. |
| `EverbridgePollDuplicateSuppression` | Everbridge dashboard widget and alarm | Warning | Polled Everbridge notifications were already processed. | Check replay patterns, overlapping polls, or harmless duplicate polling. |
| `EverbridgePollMissingEventCorrelation` | Everbridge dashboard widget and alarm | Action-required | Polled Everbridge notifications could not be mapped back to `event_id` and district. | Review `externalReference` composition, mapping logic, and source notification data. |
| `EverbridgeCallbackSummary` | Logs | Informational | Aggregate callback write and suppression counts for single callback deliveries. | Use for traceability and callback-path troubleshooting. |
| `EverbridgeCallbackDuplicateSuppression` | Everbridge dashboard widget and alarm | Warning | Duplicate callback deliveries were suppressed by dedup state. | Review callback replay behavior and webhook retry patterns before escalation. |

## Dashboard Interpretation

- Use the hazard widget to assess geospatial and event-correlation quality.
- Use the Everbridge widget to assess replay noise and notification-correlation quality.
- Use the alarm-status widget to determine whether the issue is isolated to one automation path or occurring across multiple paths.

## Escalation Guidance

- Treat repeated `missing-event-correlation` alarms as likely configuration or data-shape defects until disproven.
- Treat duplicate-suppression alarms as warning signals first; escalate only when volume spikes or business impact appears.
- Confirm the current environment profile and deployed overrides before assuming an alarm represents production-grade urgency.

## Environment Notes

- `dev` intentionally suppresses lower-value hazard duplicate alarms and relaxes some Everbridge duplicate thresholds.
- `test` suppresses lower-value hazard duplicate alarms by default.
- `prod` keeps the stricter data-quality and duplicate-coverage defaults enabled.

## Leadership Dashboard Build Checklist

### Required visual components

- Event summary card for `who`, `what`, `where`, and `how-many`.
- Count cards for `unaccounted_for`, `needing_help`, and `needing_help_contacted`.
- District heat map layer with selectable metric (`unaccounted_for`, `needing_help`, `needing_help_contacted`).
- District drill-down panel with latest update UTC, source system, confidence state, and linked Everbridge notification IDs.
- Hazard comparison panel for side-by-side or combined hazard totals.

### Required filters

- `event_id` single-select (required).
- District multi-select.
- Hazard multi-select (must allow two or more hazards simultaneously).
- Confidence-state filter (`potential`, `reported`, `confirmed`).
- Time-window filter (for example, last 6, 12, 24, and 72 hours).

### Heat map behavior requirements

- Heat map legend must show stable bucket thresholds and the active metric.
- District click action must open drill-down details for that district and event.
- Heat map values must show provenance when counts are hazard-inferred versus SitRep-confirmed.
- Heat map must expose overlap-risk metadata when selected hazards intersect.

### Multi-hazard overlap requirements

- Dashboard must show both combined totals and per-hazard totals.
- Combined totals must be deconflicted to reduce member double-counting.
- Overlap regions should be visibly marked and include double-count risk indicators.
- If deconfliction cannot be computed, the dashboard must label totals as provisional.

### Drill-down detail requirements

- Show contributing record count per district.
- Show latest update source (`ArcGIS`, `Everbridge`, or `HazardFeed`).
- Show linked `everbridge_notification_id` values where present.
- Show confidence lifecycle state and timestamp of last state transition.

### Operator validation checks

- Verify event-level totals equal the sum of district totals after deconfliction.
- Verify multi-hazard combined totals do not exceed raw per-hazard sum without an overlap warning.
- Verify known callback-driven Everbridge updates appear in district drill-down within expected sync latency.
- Verify changing confidence-state filter updates all cards, map values, and drill-down consistently.
