# SITREP Modernization Implementation Timeline

## Purpose

This document turns the recommended SITREP modernization sequence into a practical delivery timeline with owners, dependencies, and estimated durations.

## Planning Assumptions

- Timeline assumes part-time availability from operational stakeholders and full implementation support from a technical team.
- Duration estimates are in elapsed weeks, not person-weeks.
- Everbridge API access, ArcGIS administrative access, and AWS tenancy are available before Phase 3 begins.
- The team will use a pilot-first rollout and validate functionality in exercise conditions before production launch.

## Team Roles

- Sponsor: Q Directorate leadership
- Product owner: National emergency management lead
- ArcGIS lead: Survey123, feature layer, dashboard administrator
- Integration lead: AWS and API implementation owner
- Everbridge lead: Everbridge administrator and communications authority
- Data governance lead: privacy, retention, and access control reviewer
- Test coordinator: exercise planning and user acceptance lead

## Delivery Summary

| Phase | Duration | Primary Owner | Key Output |
| --- | --- | --- | --- |
| 0. Governance and discovery | 2 weeks | Product owner | Approved scope and constraints |
| 1. Data model design | 2 weeks | ArcGIS lead | Field dictionary and validation rules |
| 2. Survey123 redesign | 2 weeks | ArcGIS lead | Updated form and test publication |
| 3. ArcGIS schema changes | 2 weeks | ArcGIS lead | Updated feature service and related tables |
| 4. Dashboard rebuild | 2 weeks | ArcGIS lead | Incident-centric dashboard |
| 5. Everbridge ingestion | 3 weeks | Integration lead | Everbridge aggregate sync into ArcGIS |
| 6. Draft-generation workflow | 3 weeks | Integration lead | ArcGIS-to-Everbridge draft automation |
| 7. Hazard feed rules | 2 weeks | Integration lead | Draft rules for external feed triggers |
| 8. Exercise and hardening | 2 weeks | Test coordinator | Tested workflow and remediation list |
| 9. Production cutover | 1 week | Product owner | Production launch |

Estimated end-to-end elapsed duration: 19 weeks.

## Detailed Timeline

### Phase 0. Governance and Discovery

Duration: 2 weeks

Objectives:

- Confirm business authority boundaries between ArcGIS, Everbridge, and Q-Drive.
- Verify Everbridge license capabilities, API endpoints, rate limits, and role permissions.
- Confirm ArcGIS assets in scope and current data-sharing model.
- Define what data is operational, what data is authoritative, and what data is restricted.

Tasks:

- Inventory existing Survey123 form, feature layer, and dashboard components.
- Obtain Everbridge technical documentation and tenant-specific capabilities.
- Confirm who can approve and launch messages.
- Confirm document retention requirements for SITREPs and attachments.
- Approve national event identifier format.

Exit criteria:

- Decision record approved.
- Data ownership matrix approved.
- Named owner assigned for each platform.

### Phase 1. Data Model Design

Duration: 2 weeks

Objectives:

- Define the operational reporting model for multi-district incident management.

Tasks:

- Define incident identity fields.
- Define reporting lifecycle fields.
- Define accountability, resource, support, facility, communications, and narrative fields.
- Define required fields, conditional visibility rules, and validation rules.
- Mark fields that must never store PII.

Dependencies:

- Phase 0 approved.

Exit criteria:

- Field dictionary complete.
- Picklists and data types approved.
- Privacy review complete for new fields.

### Phase 2. Survey123 Redesign

Duration: 2 weeks

Objectives:

- Implement the revised SITREP workflow in Survey123.

Tasks:

- Rebuild the form layout around incident reporting flow.
- Add calculations, relevance logic, constraints, and required-question logic.
- Add field help text and standardized labels.
- Publish a test form and verify mobile and browser submission.

Dependencies:

- Phase 1 field dictionary approved.

Exit criteria:

- Test form published.
- Validation rules behave as expected.
- Test submissions create correct structured records.

### Phase 3. ArcGIS Schema Changes

Duration: 2 weeks

Objectives:

- Align backend storage with the revised reporting model.

Tasks:

- Extend or replace existing hosted feature layer fields.
- Create related Everbridge notification log table.
- Add integration control fields.
- Enable editor tracking, change tracking, and webhooks.
- Validate data access by dashboard viewers.

Dependencies:

- Phase 2 form published and stable.

Exit criteria:

- Feature service schema updated.
- Relationship classes or key joins tested.
- Webhooks verified in non-production.

### Phase 4. Dashboard Rebuild

Duration: 2 weeks

Objectives:

- Replace count-centric views with incident-centric situational awareness.

Tasks:

- Add incident summary, overdue report, accountability, resource request, and leadership panels.
- Add district and event drill-down filters.
- Add freshness indicators and operational period visuals.
- Suppress or aggregate sensitive data.

Dependencies:

- Phase 3 schema available.

Exit criteria:

- Dashboard supports a shared national event view.
- Test scenarios from two districts aggregate correctly.

### Phase 5. Everbridge-to-ArcGIS Ingestion

Duration: 3 weeks

Objectives:

- Ingest aggregate Everbridge notification and accountability results without changing notification behavior.

Tasks:

- Build AWS ingestion endpoints and polling jobs.
- Map Everbridge notification data to related ArcGIS records.
- Implement event correlation and deduplication logic.
- Store aggregate status only.
- Add monitoring, alerting, and retry handling.

Dependencies:

- Phase 3 schema available.
- Everbridge API access confirmed.

Exit criteria:

- Dashboard displays synchronized Everbridge accountability metrics.
- Failed syncs are visible and recoverable.

### Phase 6. ArcGIS-to-Everbridge Draft Generation

Duration: 3 weeks

Objectives:

- Convert significant SITREP changes into controlled Everbridge drafts or operator actions.

Tasks:

- Define trigger conditions.
- Build approved templates and variable mappings.
- Implement webhook receiver and draft-creation workflow.
- Add approval-state tracking in ArcGIS.
- Confirm loop-prevention logic.

Dependencies:

- Phase 5 ingestion logic stable.
- Messaging authority and templates approved.

Exit criteria:

- Drafts are created only for approved trigger conditions.
- No automated launch occurs in pilot mode.

### Phase 7. Hazard Feed Rules

Duration: 2 weeks

Objectives:

- Add external feed-based message preparation without over-alerting.

Tasks:

- Select pilot feeds and severity rules.
- Add geospatial intersection logic.
- Add duplicate and expiration handling.
- Route qualifying events to dashboard and optional draft creation.

Dependencies:

- Phase 6 trigger framework available.

Exit criteria:

- Pilot hazard events generate expected dashboard updates and draft actions.

### Phase 8. Exercise and Hardening

Duration: 2 weeks

Objectives:

- Validate end-to-end behavior under exercise conditions.

Tasks:

- Run tabletop and functional exercise.
- Validate timing, correlation, permissions, and approval workflow.
- Review logging, alarms, and recovery steps.
- Resolve high-severity defects.

Dependencies:

- Phases 2 through 7 deployed in test.

Exit criteria:

- Test report approved.
- No unresolved severity-1 defects.

### Phase 9. Production Cutover

Duration: 1 week

Objectives:

- Launch the revised form, dashboard, and initial integration capability.

Tasks:

- Freeze configuration.
- Publish production assets.
- Confirm credentials, schedules, and alarms.
- Brief district users and operators.
- Monitor first live incident cycle.

Exit criteria:

- Production system operating.
- Support ownership transferred.

## Critical Path

The critical path is:

1. Governance approval
2. Data model approval
3. Survey123 redesign
4. ArcGIS schema changes
5. Everbridge API access
6. Integration implementation
7. Exercise validation
8. Production cutover

Any delay in data model approval or Everbridge access will delay the downstream work.

## Milestones

- Milestone 1: Scope and governance approved at end of week 2.
- Milestone 2: SITREP form specification approved at end of week 4.
- Milestone 3: Test form and schema ready at end of week 8.
- Milestone 4: Dashboard rebuilt at end of week 10.
- Milestone 5: Everbridge aggregate sync working at end of week 13.
- Milestone 6: Draft-generation workflow ready at end of week 16.
- Milestone 7: Exercise complete at end of week 18.
- Milestone 8: Production launch at end of week 19.

## Recommended MVP Cut

If the full scope needs to be reduced, the MVP should include:

- Revised Survey123 event and report structure
- Updated ArcGIS schema
- Updated dashboard
- Everbridge aggregate ingestion only

This reduces delivery to roughly 10 to 13 weeks and avoids outbound messaging automation during initial rollout.