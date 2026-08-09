# Survey123 SITREP Field Specification

## Purpose

This document defines the recommended Survey123 field set, logic, and validation behavior for a national emergency management SITREP workflow.

## Design Principles

- Capture one operational snapshot per submission.
- Identify incidents consistently across districts.
- Favor structured fields over free text when information will be filtered, counted, or alerted on.
- Keep personally identifiable information out of the general SITREP.
- Preserve a fast submission path for district users.

## Form Structure

1. Event identification
2. Reporting information
3. Event phase and district posture
4. Everbridge accountability
5. Member impacts and assistance
6. Coast Guard support activity
7. Available resources
8. Requested resources
9. Facility and communications status
10. Situation and changes
11. Leadership attention required
12. Official SITREP document reference
13. Certification and submission

## Field Dictionary

| Group | Field name | Label | Type | Required | Conditional logic | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Event identification | district | District | select_one | Yes | None | Controlled picklist |
| Event identification | reporting_unit | Reporting office | text | Yes | None | Example: DSO-EM |
| Event identification | event_type | Event type | select_one | Yes | None | Hurricane, wildfire, flood, earthquake, exercise, other |
| Event identification | event_name | Event name | text | Yes | None | Example: Hurricane Alpha |
| Event identification | event_id | National event ID | text | Yes | None | Example: 2026-HUR-04 |
| Event identification | district_incident_id | District incident ID | text | No | None | Optional district-local identifier |
| Reporting information | report_type | Report type | select_one | Yes | None | Initial, update, significant change, final |
| Reporting information | sitrep_number | SITREP number | integer | Yes | None | Must be positive |
| Reporting information | report_effective_time | Report effective date and time | dateTime | Yes | None | Operational snapshot time |
| Reporting information | submission_time | Submission timestamp | calculate | Yes | Auto | Auto-captured by Survey123 |
| Reporting information | operational_period_start | Operational period start | dateTime | Yes | None | Use UTC or explicit timezone |
| Reporting information | operational_period_end | Operational period end | dateTime | Yes | None | Must be after start |
| Reporting information | reporting_interval_hours | Reporting interval hours | integer | Yes | None | Used for overdue logic |
| Reporting information | next_report_due | Next report due | dateTime | Yes | None | May be calculated from effective time plus interval |
| Reporting information | reporter_name | Reporter name | text | Yes | None | May autofill from auth profile |
| Reporting information | reporter_contact | Reporter contact | text | No | None | Email or phone, if policy allows |
| Event phase and posture | event_status | Event status | select_one | Yes | None | Monitoring/Pre-Impact, Active Response, Stabilization, Recovery/Post-Impact, Closed |
| Event phase and posture | district_posture | District posture | select_one | Yes | None | Normal, elevated monitoring, partial activation, full activation |
| Event phase and posture | activation_time | District activation time | dateTime | No | Relevant when posture is partial or full activation | |
| Event phase and posture | closure_reason | Closure reason | text | Yes | Relevant when status is Closed | Require final report before closure |
| Everbridge accountability | everbridge_used | Everbridge used | select_one yes_no | Yes | None | |
| Everbridge accountability | eb_activation_purpose | Everbridge activation purpose | select_one | Yes | Relevant when everbridge_used = yes | Accountability, notification, recall, exercise, other |
| Everbridge accountability | eb_notification_id | Everbridge notification ID | text | No | Relevant when everbridge_used = yes | Filled manually or by sync |
| Everbridge accountability | eb_notification_title | Everbridge notification title | text | No | Relevant when everbridge_used = yes | |
| Everbridge accountability | eb_targeted_count | Number targeted | integer | No | Relevant when everbridge_used = yes | Nonnegative |
| Everbridge accountability | eb_confirmed_safe | Number confirmed safe | integer | No | Relevant when everbridge_used = yes | Nonnegative |
| Everbridge accountability | eb_requesting_assistance | Number requesting assistance | integer | No | Relevant when everbridge_used = yes | Nonnegative |
| Everbridge accountability | eb_no_response | Number not responding | integer | No | Relevant when everbridge_used = yes | Nonnegative |
| Everbridge accountability | eb_accountability_complete | Accountability complete | select_one yes_no | No | Relevant when everbridge_used = yes | |
| Everbridge accountability | eb_completion_time | Accountability completion time | dateTime | No | Relevant when eb_accountability_complete = yes | |
| Everbridge accountability | eb_followup_required | Everbridge follow-up required | select_one yes_no | No | Relevant when everbridge_used = yes | |
| Member impacts | members_potentially_affected | Total members potentially affected | integer | Yes | None | Nonnegative |
| Member impacts | members_contacted | Members contacted | integer | Yes | None | Nonnegative |
| Member impacts | members_confirmed_safe | Members confirmed safe | integer | Yes | None | Nonnegative |
| Member impacts | members_not_accounted_for | Members not accounted for | integer | Yes | None | Nonnegative |
| Member impacts | members_displaced | Members displaced | integer | Yes | None | Nonnegative |
| Member impacts | members_property_damage | Members with property damage | integer | Yes | None | Nonnegative |
| Member impacts | members_injured | Members injured | integer | Yes | None | Nonnegative; trigger critical notice if > 0 |
| Member impacts | members_requesting_assistance | Members requesting assistance | integer | Yes | None | Nonnegative |
| Member impacts | open_assistance_cases | Open assistance cases | integer | Yes | None | Nonnegative |
| Member impacts | impact_explanation | Impact explanation | text | Yes | Relevant when any impact field > 0 | Brief operational explanation only |
| CG support | cgarep_count | CGAREP personnel supporting response | integer | Yes | None | Nonnegative |
| CG support | imt_staff_count | IMT staff supporting response | integer | Yes | None | Nonnegative |
| CG support | air_crew_count | Air crew supporting response | integer | Yes | None | Nonnegative |
| CG support | surface_crew_count | Surface crew supporting response | integer | Yes | None | Nonnegative |
| CG support | communications_count | Communications personnel supporting response | integer | Yes | None | Nonnegative |
| CG support | culinary_assistance_count | Culinary assistance personnel | integer | Yes | None | Nonnegative |
| CG support | interpreter_count | Interpreters supporting response | integer | Yes | None | Nonnegative |
| CG support | other_support_count | Other support count | integer | Yes | None | Nonnegative |
| CG support | other_support_description | Other support description | text | No | Relevant when other_support_count > 0 | |
| CG support | total_support_count | Total personnel supporting response | calculate | Yes | Auto | Sum of category counts |
| Available resources | air_available | Air crews or facilities available | integer | Yes | None | Nonnegative |
| Available resources | surface_available | Surface crews or facilities available | integer | Yes | None | Nonnegative |
| Available resources | radio_available | Radio resources available | integer | Yes | None | Nonnegative |
| Available resources | vehicles_available | Vehicles available | integer | Yes | None | Nonnegative |
| Available resources | other_capabilities_available | Other capabilities available | text | No | None | Short description |
| Requested resources | external_assistance_requested | Assistance requested from outside district | select_one yes_no | Yes | None | |
| Requested resources | requested_capability | Resource or capability requested | text | Yes | Relevant when external_assistance_requested = yes | |
| Requested resources | requested_quantity | Quantity requested | integer | Yes | Relevant when external_assistance_requested = yes | Positive integer |
| Requested resources | requested_priority | Priority | select_one | Yes | Relevant when external_assistance_requested = yes | Routine, high, urgent |
| Requested resources | needed_by | Needed-by date and time | dateTime | Yes | Relevant when external_assistance_requested = yes | |
| Requested resources | requesting_organization | Requesting organization | text | Yes | Relevant when external_assistance_requested = yes | |
| Requested resources | request_status | Request status | select_one | Yes | Relevant when external_assistance_requested = yes | Open, sourcing, assigned, fulfilled, cancelled |
| Requested resources | assigned_organization | Assigned organization | text | No | Relevant when request_status = assigned or fulfilled | |
| Requested resources | request_remarks | Resource request remarks | text | No | Relevant when external_assistance_requested = yes | |
| Facility and communications | aux_facilities_affected | Auxiliary facilities affected | integer | Yes | None | Nonnegative |
| Facility and communications | facilities_closed_limited | Facilities closed or limited | integer | Yes | None | Nonnegative |
| Facility and communications | aircraft_vessels_damaged | Aircraft or vessel facilities damaged | integer | Yes | None | Nonnegative |
| Facility and communications | internet_cellular_status | Internet/cellular status | select_one | Yes | None | Normal, degraded, unavailable |
| Facility and communications | radio_network_status | Radio network status | select_one | Yes | None | Normal, degraded, unavailable |
| Facility and communications | command_post_status | Command post or staging status | select_one | Yes | None | Not activated, active, degraded, relocated |
| Facility and communications | facility_comms_remarks | Facility and communications remarks | text | No | Relevant when any status is degraded or unavailable | Avoid sensitive location details |
| Situation and changes | current_situation | Current situation | text | Yes | None | 1000 character target |
| Situation and changes | significant_changes | Significant changes since last report | text | No | Relevant when report_type is update or significant change | |
| Situation and changes | actions_completed | Actions completed | text | No | None | |
| Situation and changes | planned_actions | Planned actions | text | No | None | |
| Situation and changes | limiting_factors | Limiting factors | text | No | None | |
| Leadership attention | leadership_attention_required | Leadership attention required | select_one yes_no | Yes | None | |
| Leadership attention | leadership_attention_summary | Leadership attention summary | text | Yes | Relevant when leadership_attention_required = yes | Decision, approval, or escalation needed |
| Document reference | official_sitrep_stored | Official SITREP stored in Q-Drive | select_one yes_no | Yes | None | |
| Document reference | qdrive_sitrep_url | Q-Drive SITREP URL | text | No | Relevant when official_sitrep_stored = yes | Requires permission model review |
| Document reference | document_filename | Document filename | text | No | Relevant when official_sitrep_stored = yes | |
| Document reference | document_datetime | Document date and time | dateTime | No | Relevant when official_sitrep_stored = yes | |
| Document reference | document_type | Document type | select_one | No | Relevant when official_sitrep_stored = yes | SITREP, attachment, map, other |
| Certification | certify_report | Certification | select_one yes_no | Yes | None | User affirms submission is accurate to the best of their knowledge |

## Validation Rules

### General constraints

- All numeric fields must be zero or greater.
- `sitrep_number` must be greater than zero.
- `operational_period_end` must be after `operational_period_start`.
- `next_report_due` must be after `report_effective_time`.
- If `event_status` is `Closed`, `report_type` must be `Final`.
- If any impact count is greater than zero, `impact_explanation` is required.
- If `members_injured` is greater than zero, display warning text directing immediate separate reporting through established critical incident channels.
- If `external_assistance_requested` is `yes`, the full resource-request subgroup is required.
- If `leadership_attention_required` is `yes`, the summary field is required.

### Recommended calculations

- `submission_time = now()`
- `total_support_count = sum(cgarep_count, imt_staff_count, air_crew_count, surface_crew_count, communications_count, culinary_assistance_count, interpreter_count, other_support_count)`
- Optional `next_report_due = report_effective_time + reporting_interval_hours`

## Suggested Choice Lists

### event_type

- Hurricane/Typhoon/Tropical
- Flood
- Severe Weather
- Wildfire
- Earthquake
- Tsunami
- Volcanic Activity
- Spill of National Significance
- Public Health
- Cyber/Communications
- Exercise
- Other

### report_type

- Initial
- Update
- Significant Change
- Final

### event_status

- Monitoring/Pre-Impact
- Active Response
- Stabilization
- Recovery/Post-Impact
- Closed

### district_posture

- Normal
- Elevated Monitoring
- Partial Activation
- Full Activation

### requested_priority

- Routine
- High
- Urgent

### request_status

- Open
- Sourcing
- Assigned
- Fulfilled
- Cancelled

## Privacy and Data Handling Notes

- Do not collect names, home addresses, personal phone numbers, or medical details for affected members in this form.
- Dashboard displays should use counts and aggregated status only.
- Any critical injury or death workflow should direct the reporter to an out-of-band process.
- Q-Drive links should be shared only if access is controlled for intended viewers.

## Implementation Notes

- Standardize on UTC or clearly labeled local timezone handling across all datetime fields.
- Use concise help text for any field likely to be misunderstood during active operations.
- Keep character limits high enough to avoid truncating operational summaries.
- Preserve the authenticated submitter identity in metadata even when reporter fields are editable.