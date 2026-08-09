# SITREP Modernization Planning Overview

## Included Documents

- `implementation-timeline.md`: phased delivery timeline with owners, durations, dependencies, and milestones.
- `survey123-xlsform-spec.md`: field-by-field Survey123 specification, validation rules, and implementation notes.
- `survey123-survey.csv`: XLSForm survey sheet ready for import and refinement.
- `survey123-choices.csv`: XLSForm choices sheet aligned to the SITREP field model.
- `survey123-settings.csv`: XLSForm settings sheet with form title, ID, and instance naming.
- `aws-integration-architecture.md`: target AWS architecture for ArcGIS and Everbridge integration.
- `aws-build-checklist.md`: concrete AWS deployment and validation checklist.
- `credential-access-matrix.md`: platform identities, secret ownership, scopes, and rotation model.
- `secrets-and-iam-standard.md`: secret naming, payload shape, and IAM policy skeletons.
- `secure-platform-onboarding.md`: admin procedure for provisioning and validating secure access.
- `integration-api-contracts.md`: webhook, polling, draft-creation, and internal decision contracts.
- `everbridge-trigger-matrix-and-templates.md`: trigger conditions, approval modes, and starter message templates.
- `governance-decision-record.md`: proposed ownership, approval, retention, and control decisions.
- `implementation-backlog.md`: phased backlog organized into epics and implementation-ready stories.
- `backlog-import.csv`: tracker-friendly CSV version of the implementation backlog.
- `delivery-board.csv`: owner, estimate, dependency, and release view of the work.
- `arcgis-schema-migration-plan.md`: ArcGIS layer, related table, webhook, and dashboard migration sequence.
- `operator-runbook.md`: operational guidance for SITREP submitters, coordinators, and Everbridge operators.
- `operational-observability.md`: operator-facing classification of automation metrics, alarms, dashboards, and escalation posture.
- `aws-observability-verification-runbook.md`: deployment and post-deploy verification steps for dashboards, metric filters, alarms, and Logs Insights queries.

## Recommended Reading Order

1. Read the implementation timeline for sequencing and scope decisions.
2. Review the Survey123 specification to approve the operational data model.
3. Use the XLSForm CSV files to start the actual Survey123 build.
4. Review the governance, trigger, and API documents to confirm technical and approval controls.
5. Use the credential, secrets, and onboarding documents to provision secure platform access.
6. Use the AWS build checklist to stand up the integration environment.
7. Use the ArcGIS migration plan, operator runbook, operational observability reference, and AWS observability verification runbook to prepare platform cutover and exercises.
8. Use the backlog markdown or CSV and the delivery board to assign work and track execution.

## Immediate Next Decisions

- Approve the national event identifier format.
- Confirm Everbridge API and draft-creation capabilities.
- Decide whether the first release includes Everbridge ingestion only or also draft generation.
- Confirm Q-Drive access expectations for linked documents.

## ArcGIS Dashboard Layout Spec (First Pass)

### Purpose

Define an implementation-ready ArcGIS Dashboard layout that gives leadership rapid visibility into who, what, where, and how many, while supporting district drill-down and simultaneous multi-hazard analysis.

### Page Structure

1. Header bar
- Event selector (required)
- Hazard multi-select filter
- District multi-select filter
- Confidence-state filter (`potential`, `reported`, `confirmed`)
- Time-window filter (`6h`, `12h`, `24h`, `72h`)

2. Leadership summary row
- Card: Potentially affected members (`who`)
- Card: Active hazards and active notifications (`what`)
- Card: Impacted districts and overlap districts (`where`)
- Card group: Unaccounted for, needing help, needing-help contacted (`how many`)

3. Geospatial and comparison row
- District heat map (primary)
- Hazard comparison chart (combined vs per-hazard counts)

4. Detail row
- District drill-down table
- Notification trace panel (`everbridge_notification_id`, latest source, update time)

### Required Widgets

1. Indicator widgets
- `potentiallyAffectedMembers`
- `reportedMembers`
- `unaccountedFor`
- `needingHelp`
- `needingHelpContacted`

2. Heat map widget
- Layer source: district polygons with joined impact metrics
- Metric toggle: `unaccountedFor`, `needingHelp`, `needingHelpContacted`
- Fixed bucket legend:
	- `0`
	- `1-5`
	- `6-20`
	- `21+`
- Overlay badges: confidence state and overlap risk

3. Hazard comparison widget
- Mode A: combined deconflicted totals
- Mode B: per-hazard totals
- Warning state when overlap deconfliction is incomplete

4. District drill-down table widget
- Columns:
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

### Interaction Rules

1. Filter propagation
- All global filters must update all widgets.
- Hazard multi-select must support at least two concurrent hazards.

2. Map-to-detail drill-down
- Clicking a district in the heat map filters the drill-down table to that district.
- Drill-down selection updates notification trace panel.

3. Hazard overlap handling
- When overlap exists, show `overlapRisk` badge (`low`, `medium`, `high`).
- If deconfliction status is unknown, mark totals as `provisional`.

4. Confidence-state handling
- `potential`: hazard-inferred impact only.
- `reported`: SitRep-provided values available.
- `confirmed`: validated through SitRep and/or Everbridge correlation.

### Data Dependencies

1. SitRep ingestion fields
- `event_id`
- `district`
- `members_not_accounted_for`
- `members_needing_help`
- `members_needing_help_contacted`
- `last_processed_at`

2. Everbridge correlation fields
- `everbridge_notification_id`
- `notification_status`
- `last_sync_utc`

3. Hazard correlation fields
- `hazard_type`
- `correlation_source`
- `confidence_state`
- `overlap_risk`

### Acceptance Checks

1. Leadership summary values match district-level deconflicted totals.
2. Multi-hazard combined totals do not exceed raw sums without explicit overlap warning.
3. District click-through surfaces latest source and linked notification IDs.
4. Changing confidence-state filter updates cards, heat map, and table consistently.
5. Dashboard remains readable on laptop and wallboard display sizes.
