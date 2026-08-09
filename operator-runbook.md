# SITREP and Everbridge Operator Runbook

## Purpose

This runbook describes how operators should use the revised SITREP workflow, review Everbridge drafts, and conduct functional exercises.

## Intended Users

- District SITREP submitters
- National emergency management coordinators
- Everbridge operators
- Dashboard watchers and leadership reviewers

## Operational Roles

### District SITREP submitter

- Completes Survey123 submissions for incident updates
- Maintains report timing and accuracy
- Flags leadership attention and resource requests when needed

### National emergency management coordinator

- Monitors dashboard summary and district deltas
- Reviews overdue reports and open assistance cases
- Coordinates cross-district incident visibility

### Everbridge operator

- Reviews system-created drafts
- Confirms audience, channels, and urgency
- Approves, edits, launches, or rejects messages according to policy

## Normal Incident Workflow

1. District opens a SITREP for a recognized `event_id`.
2. Survey123 submission updates the ArcGIS SITREP layer.
3. Dashboard refreshes incident views and overdue logic.
4. AWS integration evaluates trigger conditions.
5. If a trigger qualifies, an Everbridge draft is created or an operator task is generated.
6. Everbridge operator reviews and decides whether to send.
7. Everbridge aggregate results flow back to ArcGIS and appear on the dashboard.

## SITREP Submission Checklist

- Confirm the correct `event_id` is being used.
- Confirm report type and SITREP number.
- Confirm report effective time and next report due.
- Enter structured counts before using narrative fields.
- Do not include PII or medical detail in general narrative fields.
- Link the official Q-Drive document if one exists.

## Everbridge Draft Review Checklist

- Confirm the event and district are correct.
- Confirm the message type matches the trigger reason.
- Confirm the audience is appropriate.
- Confirm the message contains no PII.
- Confirm the message is not a duplicate of an active or recent communication.
- Confirm any accountability or assistance message follows operational approval policy.

## Common Draft Outcomes

### Approve and launch

Use when:

- The trigger is valid.
- The audience is correct.
- The message is necessary and time-sensitive.

### Edit before launch

Use when:

- The message is directionally correct but wording or audience needs adjustment.

### Reject

Use when:

- The draft is duplicate, stale, misrouted, or unsupported by current conditions.

### Escalate for decision

Use when:

- The trigger is valid but message authority or scope is unclear.

## Overdue Reporting Workflow

1. Dashboard flags a report past `next_report_due`.
2. Coordinator confirms whether the district has already reported through another channel.
3. If not, the reminder template may be sent manually or through approved automation.
4. If the district remains nonresponsive, escalate through chain-of-communication procedures.

## Accountability Workflow

1. District indicates Everbridge use or member accountability concerns.
2. Integration correlates notification results and updates dashboard aggregates.
3. If `members_not_accounted_for` is greater than zero, operator reviews accountability follow-up draft.
4. Case-level details remain outside the general SITREP dashboard.

## Leadership Operational Picture Workflow

1. Open the event-level leadership panel for the active incident.
2. Confirm the four primary briefing dimensions are populated: who, what, where, and how many.
3. Review key accountability counts: unaccounted for, needing help, and needing-help contacted.
4. Verify whether displayed counts are `potential`, `reported`, or `confirmed` before briefing.
5. Drill down to district view to identify which district records are contributing to each count.
6. Use latest-update timestamp and source markers to separate inferred hazard impact from SitRep-confirmed impact.
7. Include linked Everbridge notification identifier when escalation requests require communication traceability.
8. Use the heat map view to assess concentration of potential versus confirmed impact across districts.
9. Enable multi-hazard selection when concurrent hazards are active to identify overlap zones and combined impact totals.
10. During overlap conditions, verify whether counts are combined or deconflicted before issuing leadership totals.

## Operational Observability Workflow

1. Open the deployed CloudWatch dashboard identified by the Terraform `operational_dashboard_name` output.
2. Review the `operational_alarm_effective_config` output to confirm which alarms are enabled and what thresholds are active in the current environment.
3. Review the hazard and Everbridge dashboard widgets separately so data-quality failures are not confused with duplicate-noise patterns.
4. Check the alarm-status widget to see whether the same condition is isolated or affecting multiple automation paths.
5. Use repeated `missing-event-correlation` alarms as a data-quality or mapping issue until proven otherwise.
6. Use repeated duplicate-suppression alarms as a signal to review upstream deduplication behavior, scheduler overlap, or webhook replay patterns.

## Functional Exercise Script

### Exercise objectives

- Verify multi-district event correlation
- Verify overdue report logic
- Verify resource-request escalation
- Verify Everbridge draft creation and approval flow
- Verify Everbridge aggregate sync back into ArcGIS

### Minimum exercise scenario

1. Create an incident shared by two districts.
2. Submit initial SITREPs from both districts.
3. Submit an update with unaccounted-for members from one district.
4. Generate an urgent resource request from the second district.
5. Review generated Everbridge drafts.
6. Simulate Everbridge aggregate results and verify dashboard update.
7. Close the incident with final SITREPs.

## Exception Handling

### Alarm default profile reference

| Alarm | `dev` default | `test` default | `prod` default |
| --- | --- | --- | --- |
| `HazardMissingEventCorrelation` | Enabled, threshold `1`, period `900s` | Enabled, threshold `1`, period `900s` | Enabled, threshold `1`, period `900s` |
| `HazardDuplicateSuppression` | Disabled | Disabled | Enabled, threshold `2`, period `900s` |
| `EverbridgePollDuplicateSuppression` | Enabled, threshold `2`, period `300s` | Enabled, threshold `1`, period `300s` | Enabled, threshold `1`, period `300s` |
| `EverbridgePollMissingEventCorrelation` | Enabled, threshold `2`, period `300s` | Enabled, threshold `1`, period `300s` | Enabled, threshold `1`, period `300s` |
| `EverbridgeCallbackDuplicateSuppression` | Enabled, threshold `2`, period `300s` | Enabled, threshold `1`, period `300s` | Enabled, threshold `1`, period `300s` |

Use deployed Terraform outputs and `operational_alarm_overrides` to confirm whether a specific environment is running these defaults or an explicit override.

### Operational alarm fires repeatedly in non-production

- Confirm whether the environment is `dev` or `test` and whether the current default profile should already suppress lower-value duplicate alarms.
- Check the effective Terraform output for the deployed environment before assuming the default profile is still in force.
- Review the deployed `operational_alarm_overrides` values before changing code.
- If the alarm is still too noisy, raise the threshold or disable that alarm in Terraform for the non-production environment.

### Draft exists but should not be sent

- Reject the draft.
- Note the reason in the operator log.
- Confirm the source SITREP record if the trigger appears invalid.

### Dashboard values do not match Everbridge totals

- Verify the `event_id` and district correlation.
- Verify the latest sync time.
- Check whether the notification is still active or partially complete.

### SITREP appears under the wrong incident

- Check `event_id` entry on the source form.
- Confirm whether a district-local identifier was confused with the national event ID.

## Post-Incident Closeout

- Confirm final SITREP was submitted.
- Confirm dashboard status is `Closed`.
- Confirm official documents are stored in Q-Drive.
- Confirm outstanding drafts are closed or cancelled.
- Review logs and note defects or workflow confusion for improvement.
