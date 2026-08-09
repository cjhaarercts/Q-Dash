# ArcGIS Schema Migration Plan

## Purpose

This document defines the recommended ArcGIS implementation sequence for moving from the current basic SITREP schema to the expanded incident-centric model.

## Migration Strategy

Use a staged migration in a non-production environment first.

Preferred approach:

1. Create or clone a test hosted feature service.
2. Add the revised SITREP fields and related table.
3. Repoint the revised Survey123 form to the updated schema.
4. Rebuild dashboard elements against the new layer and relationships.
5. Validate multi-district event aggregation and Everbridge sync writes.
6. Promote to production after exercise validation.

This is safer than editing production schema first if the current dashboard is in active use.

## Target Components

- Hosted feature layer for SITREP submissions
- Related table: `Everbridge_Notification_Log`
- Survey123 form item
- Dashboard or Experience components reading the SITREP layer
- ArcGIS webhooks for feature create and update events

## Phase 1. Inventory Current Assets

Tasks:

- Record current feature layer item ID and URL.
- Record current Survey123 item ID.
- Record current dashboard item ID.
- Export current schema and field list.
- Record existing attachments, views, web maps, dashboards, and dependent applications.

Done when:

- Asset inventory is complete and dependency map is documented.

## Phase 2. Prepare Revised SITREP Layer

### Core event fields

- `district`
- `reporting_unit`
- `event_type`
- `event_name`
- `event_id`
- `district_incident_id`

### Report lifecycle fields

- `report_type`
- `sitrep_number`
- `report_effective_time`
- `submission_time`
- `operational_period_start`
- `operational_period_end`
- `reporting_interval_hours`
- `next_report_due`

### Event posture fields

- `event_status`
- `district_posture`
- `activation_time`
- `closure_reason`

### Everbridge status fields

- `everbridge_used`
- `eb_activation_purpose`
- `eb_notification_id`
- `eb_notification_title`
- `eb_targeted_count`
- `eb_confirmed_safe`
- `eb_requesting_assistance`
- `eb_no_response`
- `eb_accountability_complete`
- `eb_completion_time`
- `eb_followup_required`

### Member impact fields

- `members_potentially_affected`
- `members_contacted`
- `members_confirmed_safe`
- `members_not_accounted_for`
- `members_displaced`
- `members_property_damage`
- `members_injured`
- `members_requesting_assistance`
- `open_assistance_cases`
- `impact_explanation`

### Support and resource fields

- `cgarep_count`
- `imt_staff_count`
- `air_crew_count`
- `surface_crew_count`
- `communications_count`
- `culinary_assistance_count`
- `interpreter_count`
- `other_support_count`
- `other_support_description`
- `total_support_count`
- `air_available`
- `surface_available`
- `radio_available`
- `vehicles_available`
- `other_capabilities_available`
- `external_assistance_requested`
- `requested_capability`
- `requested_quantity`
- `requested_priority`
- `needed_by`
- `requesting_organization`
- `request_status`
- `assigned_organization`
- `request_remarks`

### Facility and narrative fields

- `aux_facilities_affected`
- `facilities_closed_limited`
- `aircraft_vessels_damaged`
- `internet_cellular_status`
- `radio_network_status`
- `command_post_status`
- `facility_comms_remarks`
- `current_situation`
- `significant_changes`
- `actions_completed`
- `planned_actions`
- `limiting_factors`
- `leadership_attention_required`
- `leadership_attention_summary`
- `official_sitrep_stored`
- `qdrive_sitrep_url`
- `document_filename`
- `document_datetime`
- `document_type`
- `certify_report`

### Integration-control fields

- `source_system`
- `trigger_type`
- `integration_processed`
- `notification_eligible`
- `approval_status`
- `last_notification_hash`
- `last_everbridge_sync_utc`

Done when:

- Non-production SITREP layer contains the full approved field set.

## Phase 3. Create Related Table

Create `Everbridge_Notification_Log` with at least these fields:

- `event_id`
- `district`
- `eb_notification_id`
- `notification_type`
- `notification_title`
- `launch_time_utc`
- `targeted_count`
- `delivered_count`
- `failed_count`
- `confirmed_safe`
- `assistance_requested`
- `no_response`
- `notification_status`
- `last_sync_utc`
- `source_system`

Relationship guidance:

- Use `event_id` plus district as correlation keys at the integration layer.
- If ArcGIS relationship classes require a single key pattern, maintain a derived key such as `event_district_key` on both parent and related rows.

Done when:

- Related table exists and ArcGIS-side joins or relationships are usable by the dashboard.

## Phase 4. Configure Editor and Change Tracking

Enable:

- editor tracking
- change tracking
- global IDs if not already present
- attachment policy review

Disable or avoid:

- unnecessary public editing access
- long-term attachment dependence for official PDF SITREPs

Done when:

- Webhooks and integration updates can be supported safely.

## Phase 5. Repoint Survey123

Tasks:

- Map the revised XLSForm fields to the updated layer.
- Validate relevant and required logic.
- Confirm calculated fields populate as expected.
- Confirm authenticated submitter behavior.

Done when:

- Test submissions create correct layer and related-table compatible records.

## Phase 6. Configure Webhooks

Recommended webhook events:

- create
- update

Webhook target:

- AWS API endpoint `POST /webhooks/arcgis/sitrep`

Security requirements:

- shared secret configured
- HTTPS only
- change source tracked through integration fields

Done when:

- Non-production create and update events reach the AWS receiver and can be correlated.

## Phase 7. Dashboard Migration

Update dashboard elements to support:

- incident-centric grouping by `event_id`
- district drill-down
- overdue reports based on `next_report_due`
- open resource requests
- Everbridge accountability summaries
- leadership attention items
- facility and communications status exceptions

Done when:

- The dashboard supports two districts reporting under one incident.

### Widget-by-widget implementation execution

Build order is intentional so leadership-visible value appears early while keeping data quality checks in place.

#### Widget 1: Event selector

Purpose:

- Set a single active `event_id` context for all downstream widgets.

Configuration:

- Source: SITREP hosted feature layer.
- Display field: `event_name` with `event_id` suffix.
- Filter: active events only (`event_status` not closed).
- Action: filter all target widgets.

Acceptance checks:

- Changing `event_id` updates all cards, map layers, and detail tables.
- Closed events are excluded unless explicitly enabled.

#### Widget 2: Global hazard and district filters

Purpose:

- Support multi-hazard and multi-district selection for leadership analysis.

Configuration:

- Hazard filter: multi-select, sourced from hazard classification field.
- District filter: multi-select, sourced from `district`.
- Time-window filter: `6h`, `12h`, `24h`, `72h` derived from `report_effective_time`.
- Confidence filter: `potential`, `reported`, `confirmed`.

Acceptance checks:

- Hazard filter allows two or more concurrent hazards.
- Combined filtering produces consistent totals across all widgets.

#### Widget 3: Leadership summary cards (`who`, `what`, `where`, `how many`)

Purpose:

- Provide immediate briefing numbers for senior leadership and active duty coordination.

Configuration:

- `who`: potentially affected and reported member totals.
- `what`: selected hazards and active notification count.
- `where`: impacted district count and overlap district count.
- `how many`: unaccounted for, needing help, contacted-for-help.

Acceptance checks:

- Card totals match deconflicted district totals.
- Confidence-state filter updates all displayed numbers.

#### Widget 4: District impact heat map

Purpose:

- Show spatial concentration of impact and triage zones quickly.

Configuration:

- Geometry source: district polygons.
- Metric toggle: `members_not_accounted_for`, `members_requesting_assistance`, `members_contacted`.
- Buckets:
	- `0`
	- `1-5`
	- `6-20`
	- `21+`
- Overlay indicators: confidence state and overlap risk.

Acceptance checks:

- Bucket legend is stable and visible.
- District click action drives drill-down table and trace panel.

#### Widget 5: Hazard comparison panel

Purpose:

- Compare per-hazard totals with overlap-aware combined totals.

Configuration:

- Mode A: combined deconflicted totals.
- Mode B: per-hazard totals by selected hazards.
- Warning banner: shown when overlap deconfliction is incomplete.

Acceptance checks:

- Combined totals do not exceed raw per-hazard sum unless explicitly marked provisional.
- Overlap districts are clearly identified.

#### Widget 6: District drill-down table

Purpose:

- Provide actionable district-level details behind top-level counts.

Configuration:

- Required columns:
	- `district`
	- `event_id`
	- `members_not_accounted_for`
	- `members_requesting_assistance`
	- `members_contacted`
	- `confidence_state`
	- `report_effective_time`
	- `source_system`
	- `eb_notification_id`
- Sorting: newest `report_effective_time` first.

Acceptance checks:

- Selecting a district on the map filters table to that district.
- Table values match summary cards for selected scope.

#### Widget 7: Everbridge notification trace panel

Purpose:

- Give communications traceability for each district/event snapshot.

Configuration:

- Source: `Everbridge_Notification_Log` related table.
- Display fields:
	- `eb_notification_id`
	- `notification_status`
	- `targeted_count`
	- `confirmed_safe`
	- `assistance_requested`
	- `no_response`
	- `last_sync_utc`
- Join/relationship: `event_id` + district correlation key.

Acceptance checks:

- Drill-down selection updates trace panel rows.
- Missing notification links are shown as explicit data gaps, not zeros.

#### Widget 8: Leadership attention exceptions

Purpose:

- Surface records flagged with urgent leadership context.

Configuration:

- Filter: `leadership_attention_required = yes`.
- Show district, event, summary text, and latest timestamp.
- Pin exceptions in a dedicated panel.

Acceptance checks:

- Exception count matches filtered SITREP records.
- Panel updates with global filters and event context.

### Cross-widget validation sequence

1. Select one event and one district; capture baseline totals.
2. Add second district; verify summary and heat map update.
3. Add second hazard; verify combined and per-hazard values.
4. Toggle confidence state from `potential` to `confirmed`; verify all widgets update consistently.
5. Open a district row and confirm linked Everbridge notification trace appears.

### Deployment automation opportunities

The dashboard migration includes both automatable platform tasks and ArcGIS UI-driven tasks.

#### Fully automatable today

1. Infrastructure deployment
- Terraform validate/plan/apply for API, Lambda, DynamoDB, SQS, and observability resources.

2. Secret bootstrap and environment overlays
- `bootstrap-secrets.ps1` for creating/updating Secrets Manager entries and generating environment tfvars files.

3. Runtime verification and smoke tests
- Scripted webhook auth checks.
- Scripted callback and poller invocations.
- Scripted CloudWatch log tail and alarm/dashboard output checks.

4. Regression tests
- `npm test` and `npm run check` in CI for handler and mapping changes.

#### Partially automatable with ArcGIS API scripting

1. Schema migration tasks
- Add fields and related table via ArcGIS REST or ArcGIS Python API.
- Apply domains and field metadata programmatically.

2. Asset inventory export
- Enumerate item IDs, service URLs, and dependent apps via ArcGIS API.

3. Survey123 repoint and publish checks
- Validate layer linkage and required field mappings with scripted assertions.

#### Mostly manual (unless dashboard JSON automation is introduced)

1. Dashboard widget composition and visual layout tuning.
2. Heat map styling calibration and legend ergonomics.
3. Leadership usability review and narrative flow refinements.

### Recommended automated deployment pipeline

1. Preflight
- Validate required local secret files and environment variables.
- Run `npm run check` and `npm test`.

2. Provision
- Run `bootstrap-secrets.ps1` for target environment.
- Run Terraform validate/plan/apply.

3. Verify platform
- Capture Terraform outputs (`api_base_url`, dashboard/alarm outputs).
- Run webhook and poller smoke tests.

4. Verify observability
- Validate alarm resources and metric filters.
- Execute Logs Insights queries from the observability runbook.

5. Verify dashboard data readiness
- Confirm SitRep layer fields and related table availability.
- Confirm multi-hazard filter fields and confidence-state fields are populated.

6. Manual visual signoff
- Perform widget-by-widget validation sequence.
- Record screenshot evidence and signoff notes for leadership review.

## Phase 8. Data Migration and Cutover

Options:

- Leave historical records in the old layer and start fresh in the new model.
- Backfill only selected active incidents into the new layer.
- Fully transform historical records if reporting history is critical.

Recommended default:

- Backfill only active or recent operationally relevant records unless there is a strong reporting requirement for full historical normalization.

## Validation Checklist

- Field names match XLSForm names.
- Domains and coded values match the approved choice lists.
- Numeric fields reject negative values at the form layer.
- Webhooks fire on create and update.
- Dashboard panels do not expose PII.
- Q-Drive links are visible only to authorized viewers.

## Rollback Plan

- Retain existing production layer and dashboard until the replacement is validated.
- Keep the old Survey123 form unpublished or unchanged until cutover approval.
- If cutover fails, repoint users to the previous form and dashboard while defects are corrected.