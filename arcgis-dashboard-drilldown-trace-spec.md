# ArcGIS Dashboard Drill-Down and Trace Panel Specification (DSH-06)

## Purpose

Define DSH-06 requirements for district drill-down and Everbridge traceability panels.

## Source Inputs

Primary source is leadership response contract section 5 in `integration-api-contracts.md`.

Required fields from base payload:

- `districtDetails[]`
- `districtDetails[].district`
- `districtDetails[].eventId`
- `districtDetails[].hazards[]`
- `districtDetails[].latestUpdateUtc`
- `districtDetails[].source`
- `districtDetails[].everbridgeNotificationIds[]`
- `districtDetails[].counts.*`
- `districtDetails[].drillDown.*`

Trace panel view model:

- `notificationTrace[]`
- `notificationTrace[].district`
- `notificationTrace[].eventId`
- `notificationTrace[].latestSource`
- `notificationTrace[].latestUpdateUtc`
- `notificationTrace[].everbridgeNotificationIds[]`

## Drill-Down Table Columns

Required columns:

- `district`
- `event_id`
- `hazards`
- `unaccounted_for`
- `needing_help`
- `needing_help_contacted`
- `confidence_state`
- `latest_update_utc`
- `source_system`
- `everbridge_notification_id`

Sorting requirement:

- Sort by newest `latest_update_utc` first.

## Trace Panel Rules

1. District linkage

- Every `notificationTrace[].district` must match one district in `districtDetails[]`.

1. Event linkage

- `notificationTrace[].eventId` must equal the corresponding district `eventId`.

1. Timestamp/source consistency

- `notificationTrace[].latestUpdateUtc` must equal district `latestUpdateUtc`.
- `notificationTrace[].latestSource` must equal district `source`.

1. Notification ID consistency

- Every `notificationTrace[].everbridgeNotificationIds[]` value must appear in the district-level `everbridgeNotificationIds[]` list.

## Interaction Wiring

1. Map click and filter behavior

- Clicking a district polygon sets district filter context.
- Drill-down table filters to selected district.
- Trace panel updates to selected district/event linkage.

1. Global filter behavior

- Event, hazard, district, confidence-state, and time-window filters all apply to drill-down and trace panel.

## Validation Commands

```powershell
npm run dashboard:validate-contract -- <path-to-response-json>
npm run dashboard:validate-drilldown-trace -- <path-to-response-json>
```

## DSH-06 Exit Checklist

- Drill-down table shows all required columns and latest-first sorting.
- Trace panel renders consistent latest source and timestamp values.
- Notification IDs in trace panel reconcile with district details.
- District selection updates both table and trace panel context.
