# ArcGIS Dashboard Day 1 Checklist (DSH-01 to DSH-03)

Date: 2026-08-09
Owner: Dashboard implementation team

## Goal

Complete Phase 1 startup tasks:

- DSH-01 Leadership contract data readiness
- DSH-02 Global filter wiring design and initial config
- DSH-03 Summary card row implementation baseline

## Inputs

- `arcgis-online-dashboard-phase1.md`
- `integration-api-contracts.md` (section 5 leadership visualization contract)
- `planning-overview.md` (dashboard layout and interaction rules)
- `operational-observability.md` (filter and validation behavior)

## Task 1: DSH-01 Data Contract Readiness

1. Select one active event ID with known multi-district records.
2. Retrieve leadership contract payload for that event.
3. Confirm required request parameters are supported:
   - eventId
   - hazards[]
   - districts[]
   - confidenceStates[]
   - timeWindowHours
4. Confirm required response sections are populated:
   - whoWhatWhereHowMany
   - confidence.state and confidence.sourceMix
   - heatMap with buckets and districtValues
   - districtDetails with source and notification IDs
5. Capture one validated payload sample and save under reports for traceability.

Exit criteria:

- All mandatory fields present for one active event.
- Known null/empty fields documented with owner and fix path.

## Task 2: DSH-02 Global Filter Wiring

1. Create or update ArcGIS Dashboard selectors:
   - required `event_id` selector
   - hazard multi-select
   - district multi-select
   - confidence-state selector
   - time-window selector (6h, 12h, 24h, 72h)
2. Define one-way filter propagation from selectors to:
   - summary cards
   - heat map
   - hazard comparison panel
   - district drill-down table
3. Verify hazard selector supports two or more simultaneous hazards.
4. Confirm default behavior when no event is selected (no misleading totals rendered).

Exit criteria:

- Filter definitions saved in dashboard configuration.
- All target widgets respond to event/hazard/district/confidence/window changes.

## Task 3: DSH-03 Summary Card Row Baseline

1. Build card row widgets for:
   - potentiallyAffectedMembers
   - active hazards and active notifications
   - impacted districts and overlap districts
   - unaccountedFor
   - needingHelp
   - needingHelpContacted
2. Validate card values against district-level totals for selected event.
3. Confirm confidence context is visible and understandable in row presentation.

Exit criteria:

- Summary row renders for selected event.
- Card totals reconcile with district detail totals after deconfliction.

## Evidence to Capture Today

- Dashboard screenshot with all filters visible.
- Dashboard screenshot with multi-hazard selection active.
- One contract payload sample (redacted for secrets if needed).
- Reconciliation notes for summary-card totals vs district details.

## Risks to Watch

- Missing or delayed `everbridge_notification_id` linkage in district details.
- Deconfliction status unknown causing provisional totals.
- Confidence-state mismatches between summary cards and drill-down rows.

## End-of-Day Deliverable

- Mark DSH-01, DSH-02, DSH-03 as complete/in-progress in `implementation-backlog.md` tracking system.
- Publish a short day-1 progress note with blockers and next actions.
