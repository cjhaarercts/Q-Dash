# ArcGIS Online Dashboard Phase 1 Build Plan

## Objective

Deliver the first production ArcGIS Online leadership dashboard for active events with:

- Who/what/where/how-many summary
- District heat map with metric toggle
- Hazard comparison (combined and per-hazard)
- District drill-down and Everbridge traceability

## Scope (Phase 1)

In scope:

- Dashboard assembly in ArcGIS Online using existing promoted test/prod data sources.
- Leadership visualization contract implementation from `integration-api-contracts.md` section 5.
- Required filters and interaction rules from `planning-overview.md` and `operational-observability.md`.
- Concrete filter wiring and validation map from `arcgis-dashboard-filter-wiring-spec.md`.
- Summary card field bindings and reconciliation rules from `arcgis-dashboard-summary-card-binding-spec.md`.
- Heat map metric toggle, bucket, and drill-down rules from `arcgis-dashboard-heatmap-wiring-spec.md`.
- Hazard comparison modes and overlap/provisional rules from `arcgis-dashboard-hazard-comparison-spec.md`.
- Drill-down table and notification trace panel rules from `arcgis-dashboard-drilldown-trace-spec.md`.

Out of scope:

- New ingestion pipelines or schema redesign.
- Custom web app outside ArcGIS Dashboard for this phase.

## Build Sequence

1. Data contract readiness check

- Validate contract fields exist and are queryable for a known active event.

1. Filter foundation

- Configure required global selectors:
  - event_id (required)
  - hazard (multi-select)
  - district (multi-select)
  - confidence state
  - time window

1. Leadership summary row

- Build and bind who/what/where/how-many cards.

1. Heat map and interaction wiring

- Implement district polygons, bucket legend, metric toggle, and click-to-drill behavior.

1. Hazard comparison

- Implement combined deconflicted vs per-hazard views with overlap risk messaging.

1. Drill-down and trace panel

- Add district detail table and linked notification context.

1. Validation and publish

- Run acceptance checks and publish cutover package.

## Ticket Set (Execution Ready)

| ID | Title | Estimate | Dependencies | Deliverable |
| --- | --- | --- | --- | --- |
| DSH-01 | Leadership contract data readiness | 1 day | None | Validated response payload samples for active event |
| DSH-02 | Global filter wiring | 1 day | DSH-01 | Event, hazard, district, confidence, window filters applied globally |
| DSH-03 | Summary card row | 1 day | DSH-02 | Who/what/where/how-many cards bound and reconciled |
| DSH-04 | District heat map | 1.5 days | DSH-02 | Metric toggle map with fixed buckets and district click action |
| DSH-05 | Hazard comparison panel | 1 day | DSH-02 | Combined and per-hazard comparison with overlap warnings |
| DSH-06 | Drill-down + trace panel | 1 day | DSH-04, DSH-05 | District detail table with notification trace linkage |
| DSH-07 | Functional validation run | 1 day | DSH-03..DSH-06 | Validation checklist evidence and defect list |
| DSH-08 | Publish cutover package | 0.5 day | DSH-07 | Dashboard URL, config notes, operator checks |

## Acceptance Checklist

- Leadership summary matches district deconflicted totals.
- Hazard multi-select supports at least two concurrent hazards.
- Overlap risk and provisional states are clearly visible when required.
- Confidence-state filter updates cards, map, comparison, and table consistently.
- District selection updates drill-down and notification trace context.
- Dashboard remains readable for laptop and wallboard display sizes.

## Definition of Done

- All DSH-01 through DSH-08 tickets completed.
- Validation evidence recorded.
- Dashboard handoff linked from runbook docs.
