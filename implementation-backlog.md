# SITREP and Everbridge Integration Backlog

## Purpose

This backlog breaks the modernization effort into implementation-ready work items. Stories are grouped by epic and sequenced for phased delivery.

## Epic 1. Governance and Discovery

### Story 1.1: Approve system-of-record boundaries

Description:

Define which platform is authoritative for operational status, communications, and document retention.

Acceptance criteria:

- Decision record identifies ArcGIS, Everbridge, and Q-Drive ownership boundaries.
- Stakeholders approve the document.

### Story 1.2: Confirm Everbridge tenant capabilities

Description:

Verify API access, callback support, roles, and draft-creation capability.

Acceptance criteria:

- Capabilities matrix completed.
- Required credentials and contacts identified.

### Story 1.3: Define national event ID standard

Description:

Create a format and assignment rule for event IDs shared across districts.

Acceptance criteria:

- Event ID format approved.
- Ownership for issuing event IDs defined.

## Epic 2. SITREP Data Model

### Story 2.1: Define incident identity fields

Acceptance criteria:

- `event_id`, `event_name`, `event_type`, and `district_incident_id` added to field dictionary.

### Story 2.2: Define report lifecycle fields

Acceptance criteria:

- `report_type`, `sitrep_number`, `operational_period_start`, `operational_period_end`, `next_report_due`, and `reporting_interval_hours` specified.

### Story 2.3: Define member accountability and impact fields

Acceptance criteria:

- Member-impact count fields approved.
- PII exclusion rules documented.

### Story 2.4: Define resource availability and request fields

Acceptance criteria:

- Availability and request sections separated.
- Open request tracking fields approved.

### Story 2.5: Define facility, communications, and narrative fields

Acceptance criteria:

- Structured narrative fields replace generic comments.
- Facility and communications fields approved.

## Epic 3. Survey123 Form Implementation

### Story 3.1: Rebuild form structure

Acceptance criteria:

- Form contains all approved sections in the target sequence.
- Required questions are clearly marked.

### Story 3.2: Implement conditional logic

Acceptance criteria:

- Everbridge, resource request, and closure subgroups appear only when relevant.

### Story 3.3: Implement validation and calculations

Acceptance criteria:

- Negative values are blocked.
- Support totals calculate correctly.
- Final report is required before closure.

### Story 3.4: Publish and test revised Survey123 form

Acceptance criteria:

- Test submissions succeed from browser and mobile.
- Stored records match expected schema.

## Epic 4. ArcGIS Schema and Dashboard

### Story 4.1: Update SITREP hosted feature layer schema

Acceptance criteria:

- New fields are added or replacement service is published.
- Editor tracking and change tracking are enabled.

### Story 4.2: Create Everbridge notification related table

Acceptance criteria:

- `Everbridge_Notification_Log` exists and supports event correlation.

### Story 4.3: Add integration-control fields

Acceptance criteria:

- Loop-prevention and approval-state fields exist in ArcGIS.

### Story 4.4: Rebuild dashboard for event-centric reporting

Acceptance criteria:

- Dashboard groups by `event_id`.
- Overdue, accountability, and resource-request panels are available.

### Story 4.5: Validate multi-district event aggregation

Acceptance criteria:

- Two districts reporting the same event aggregate correctly under one incident view.

## Epic 5. Everbridge Ingestion

### Story 5.1: Build secure Everbridge polling client

Acceptance criteria:

- Poller retrieves notification summary data using tenant credentials.

### Story 5.2: Implement Everbridge callback receiver if available

Acceptance criteria:

- Callback endpoint validates source and triggers detail refresh.

### Story 5.3: Map Everbridge aggregates to ArcGIS related table

Acceptance criteria:

- Notification summaries are written to ArcGIS without PII.

### Story 5.4: Implement event correlation and exception handling

Acceptance criteria:

- Unmatched notifications are flagged for review.
- Matched notifications appear under the correct event.

### Story 5.5: Add Everbridge accountability dashboard panel

Acceptance criteria:

- Dashboard displays targeted, safe, assistance, no response, and last sync indicators.

## Epic 6. ArcGIS to Everbridge Draft Automation

### Story 6.1: Define approved outbound trigger conditions

Acceptance criteria:

- Trigger matrix approved by operational and communications owners.

### Story 6.2: Build Survey123 and feature-layer webhook receiver

Acceptance criteria:

- Receiver accepts signed webhook events and logs processing decisions.

### Story 6.3: Implement draft message template mapping

Acceptance criteria:

- Template variables map to SITREP fields.
- Output message preview is reviewable.

### Story 6.4: Create Everbridge draft workflow

Acceptance criteria:

- Qualifying events create drafts or operator tasks.
- No automatic launch occurs in pilot mode.

### Story 6.5: Record approval status back in ArcGIS

Acceptance criteria:

- ArcGIS records show whether a draft was created, reviewed, approved, or rejected.

## Epic 7. Hazard Feed Automation

### Story 7.1: Select pilot hazard feeds

Acceptance criteria:

- One or more authoritative feeds approved for pilot use.

### Story 7.2: Implement geospatial relevance rules

Acceptance criteria:

- Feed events are filtered by district intersection or area of concern.

### Story 7.3: Implement severity and expiration rules

Acceptance criteria:

- Only qualifying active hazards progress to messaging logic.

### Story 7.4: Implement feed deduplication

Acceptance criteria:

- Repeat or immaterial feed updates do not create duplicate drafts.

## Epic 8. AWS Platform and Security

### Story 8.1: Provision AWS environment

Acceptance criteria:

- API Gateway, Lambda, DynamoDB, SQS, CloudWatch, and Secrets Manager resources are deployed in test.

### Story 8.2: Implement secrets and IAM controls

Acceptance criteria:

- Credentials are stored in Secrets Manager.
- Least-privilege IAM policies are applied.

### Story 8.3: Add monitoring and alarms

Acceptance criteria:

- Failures, queue growth, and authentication issues trigger alerts.

### Story 8.4: Add audit logging

Acceptance criteria:

- Every message-related action is traceable by source, time, and outcome.

## Epic 9. Leadership Situational Awareness and SitRep Ingestion

### Story 9.1: Define leadership-facing who/what/where/how-many model

Description:

Define a single operational view that answers who is impacted, what is happening, where it is happening, and how many are unaccounted for, need help, and have been contacted.

Acceptance criteria:

- Data contract includes district, event, source timestamps, and roll-up counts.
- Count definitions for unaccounted, needing help, and contacted-for-help are approved.
- Model includes confidence/provenance markers for inferred versus operator-confirmed values.

### Story 9.2: Extend SitRep ingestion schema for accountability and contact state

Description:

Expand SitRep ingestion fields to persist leadership metrics and related Everbridge context, including notification linkage.

Acceptance criteria:

- Ingestion schema stores `everbridge_notification_id` with event and district correlation.
- Ingestion schema stores unaccounted, needs-help, and needs-help-contacted counts.
- Backfill/default behavior is defined for missing counts.

### Story 9.3: Build event-district roll-up and drill-down views

Description:

Create dashboards and query views that show national roll-up totals and district-level drill-down details for active events.

Acceptance criteria:

- Top-level dashboard shows event totals for who/what/where/how-many.
- District drill-down shows contributing records, latest update time, and source system.
- Views support filtering by active event, district, and reporting interval.

### Story 9.4: Correlate ArcGIS hazard events with Everbridge potential impact

Description:

When ArcGIS indicates a known event footprint, query Everbridge for potentially affected members and present potential impact before enhanced SitRep submission.

Acceptance criteria:

- Geospatial correlation routine links hazard footprint to Everbridge audience scope.
- Potential impact counts are displayed as inferred/preliminary until SitRep confirmation.
- Correlation provenance distinguishes `hazard-inferred` from `sitrep-confirmed`.

### Story 9.5: Implement staged confidence lifecycle for impact numbers

Description:

Represent operational figures through a lifecycle from inferred to confirmed as new SitRep and Everbridge data arrives.

Acceptance criteria:

- Status states include `potential`, `reported`, and `confirmed`.
- Transitions are auditable with timestamp and source.
- Dashboard clearly labels confidence state for each key count.

### Story 9.6: Add leadership briefing export and API contract

Description:

Provide a concise machine-readable and human-readable briefing view to support active duty coordination requests.

Acceptance criteria:

- Briefing payload includes event, district, who/what/where/how-many, and last update source.
- Export supports both dashboard card consumption and JSON API retrieval.
- PII exclusion rules are enforced for briefing output.

### Story 9.7: Add district-level impact heat map visualization

Description:

Provide an interactive map layer that visualizes potential and confirmed member impact density across districts for active events.

Acceptance criteria:

- Heat map supports toggling between `potential`, `reported`, and `confirmed` impact states.
- Heat map legend clearly distinguishes unaccounted, needing-help, and contacted-for-help metrics.
- District click/select action opens district drill-down details and source timestamps.

### Story 9.8: Support simultaneous multi-hazard selection and comparison

Description:

Allow operators and leadership users to select more than one hazard at the same time and compare overlap, counts, and district impacts.

Acceptance criteria:

- Dashboard supports multi-select hazard filters with at least two concurrent hazards.
- Aggregated counts update correctly for combined and per-hazard views.
- Visual indicators show overlap zones and potential double-count risk where hazards intersect.

## Epic 10. Testing and Rollout

### Story 10.1: Run tabletop validation

Acceptance criteria:

- Stakeholders walk through incident creation, updates, accountability, and closure.

### Story 10.2: Run functional exercise

Acceptance criteria:

- Multi-district incident exercise completes with end-to-end data flow.

### Story 10.3: Resolve critical defects

Acceptance criteria:

- No unresolved severity-1 defects remain.

### Story 10.4: Prepare production rollout and training

Acceptance criteria:

- User guide, operator guide, and support contacts are published.

## Suggested Release Plan

### Release 1

- Governance complete
- SITREP field model complete
- Survey123 redesign complete
- ArcGIS schema complete
- Dashboard rebuilt

### Release 2

- Everbridge aggregate ingestion complete
- Accountability dashboard complete

### Release 3

- ArcGIS-triggered draft generation complete
- Approval workflow complete

### Release 4

- Hazard feed pilot complete
- Narrow automated reminders evaluated

## MVP Stories

If schedule pressure requires a reduced first release, prioritize:

- Story 1.3
- Story 2.1
- Story 2.2
- Story 2.3
- Story 2.4
- Story 3.1
- Story 3.2
- Story 3.3
- Story 4.1
- Story 4.2
- Story 4.4
- Story 5.1
- Story 5.3
- Story 5.5