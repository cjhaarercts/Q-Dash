# SITREP Modernization Governance Decision Record

## Purpose

This decision record defines the recommended governance model for the national SITREP modernization effort spanning ArcGIS, Everbridge, Q-Drive, and AWS.

## Status

Proposed

## Decision Summary

Adopt a split-authority model:

- ArcGIS is the system of record for structured operational status.
- Everbridge is the system of record for outbound notification activity and accountability messaging.
- Q-Drive is the system of record for official SITREP documents and retained files.
- AWS is the controlled integration layer and audit boundary between systems.

## Scope

This decision applies to:

- Survey123 submissions and updates
- ArcGIS hosted feature layers and dashboards
- Everbridge notification and accountability data flows
- Linked SITREP documents stored outside ArcGIS
- Automation rules that prepare or transmit communications

## Decisions

### 1. System-of-record boundaries

- ArcGIS stores structured incident reporting fields, calculated metrics, and integration state.
- Everbridge stores notification definitions, audiences, delivery state, and accountability interactions.
- Q-Drive stores the final official PDF SITREP and supporting files requiring long-term retention.
- AWS stores transient processing state, deduplication keys, audit logs, and integration metadata.

### 2. Data handling model

- ArcGIS dashboards should display counts, summaries, and aggregate statuses.
- Member-level personal data must not be written into the general SITREP dataset.
- Everbridge-to-ArcGIS sync should store only aggregate accountability and delivery metrics.
- Sensitive incident details requiring controlled access should remain in approved authoritative systems outside public dashboards.

### 3. Event identification standard

Recommended national event ID format:

`YYYY-TYPE-SEQ`

Examples:

- `2026-HUR-04`
- `2026-FLD-02`
- `2026-EXR-01`

Rules:

- `YYYY` is the calendar year the national event record is opened.
- `TYPE` is a short event-type code maintained in a controlled lookup.
- `SEQ` is a zero-padded sequence number assigned centrally.
- One national event ID may be used by multiple districts when they are reporting on the same incident.

### 4. Message authority and approval

- Everbridge remains the only platform authorized to launch member notifications.
- ArcGIS-originated automation may create notification drafts or operator tasks but should not launch operational messages during the initial phases.
- Human approval is required for accountability activations, warning notifications, and assistance messages until post-exercise approval explicitly changes that policy.
- Narrow administrative reminders may be considered later for automated launch.

### 5. Attachment and document retention

- ArcGIS should avoid long-term storage of PDF SITREPs when Q-Drive is the designated record repository.
- Survey123 should capture document metadata and Q-Drive link fields instead of relying on permanent ArcGIS file attachments.
- Dashboard users must have permission to linked Q-Drive locations if document links are exposed.

### 6. Audit and compliance

- Every integration action affecting messaging or dashboard status must be logged with timestamp, source, correlation ID, outcome, and operator context when applicable.
- Loop-prevention and deduplication state must be preserved for operational review.
- Credential use must be centralized in AWS and not embedded in forms, dashboards, or browser code.

## Ownership Model

| Function | Primary owner | Supporting owner |
| --- | --- | --- |
| Operational data model | National emergency management lead | ArcGIS lead |
| Survey123 and dashboard configuration | ArcGIS lead | Product owner |
| Everbridge configuration and templates | Everbridge lead | Communications authority |
| Integration service and credentials | Integration lead | Cloud platform owner |
| Privacy and retention review | Data governance lead | Product owner |
| Exercise validation | Test coordinator | All platform owners |

## Assumptions

- The Everbridge tenant supports API-based data access.
- ArcGIS hosted services in scope support change tracking and webhook workflows.
- Q-Drive permissions can be aligned with dashboard-viewer needs.

## Risks if Not Adopted

- Duplicate event naming across districts will undermine national reporting.
- Direct ArcGIS-to-Everbridge coupling increases credential and control risk.
- Unstructured narratives will limit filtering and decision support.
- Permanent PDF storage in ArcGIS may increase storage cost and retention complexity.

## Required Follow-up Approvals

- Approve national event ID issuing authority.
- Approve initial trigger matrix for Everbridge draft creation.
- Approve privacy guardrails for injury and accountability data.
- Approve which users may view Q-Drive document links.