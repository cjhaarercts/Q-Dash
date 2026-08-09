# Everbridge Trigger Matrix and Message Templates

## Purpose

This document defines the recommended trigger matrix, approval rules, and baseline message templates for ArcGIS-driven Everbridge draft creation.

## Operating Rules

- ArcGIS may prepare notifications, not launch operational messages, during pilot phases.
- Message creation requires a recognized `event_id` and district.
- All triggers must pass deduplication and relevance checks.
- Aggregate status only should be carried from ArcGIS into generic notification text.

## Trigger Matrix

| Trigger ID | Trigger condition | Message type | Target audience | Approval mode | Notes |
| --- | --- | --- | --- | --- | --- |
| TRG-01 | `event_status` changes to `active_response` | District status update | District leadership | Manual | Initial operational notice |
| TRG-02 | `members_not_accounted_for > 0` | Accountability follow-up | Authorized accountability operators | Manual | Do not include names or medical detail |
| TRG-03 | `members_requesting_assistance` increases materially | Assistance escalation | National EM leadership | Manual | Threshold should be configured |
| TRG-04 | `requested_priority = urgent` and `request_status = open` | Urgent resource request | National coordination staff | Manual | Include capability and needed-by time |
| TRG-05 | `leadership_attention_required = yes` | Leadership decision request | Q leadership | Manual | Use short decision-oriented summary |
| TRG-06 | `now > next_report_due` | Reporting reminder | Reporting unit | Automatic or manual | Suitable candidate for later automation |
| TRG-07 | Hazard feed severity threshold met and district intersects area | Hazard monitoring notice | District leadership | Manual | Pilot after SITREP-based triggers |

## Suppression Rules

- Suppress if `Source_System = EverbridgeSync`.
- Suppress if no recognized `event_id` is present.
- Suppress if the material-content hash already exists for the operational period.
- Suppress if the event is closed unless the message type is administrative closeout.
- Suppress if required template variables are missing.

## Template Variables

Common variables:

- `district`
- `event_name`
- `event_id`
- `event_status`
- `report_type`
- `report_effective_time`
- `next_report_due`
- `members_not_accounted_for`
- `members_requesting_assistance`
- `requested_capability`
- `requested_quantity`
- `requested_priority`
- `needed_by`
- `leadership_attention_summary`
- `current_situation`

## Template 1. District Status Update

Template ID: `tmpl-district-status-update`

Use when:

- TRG-01 fires

Audience:

- District leadership or designated coordination audience

Subject:

`{district} status update for {event_name}`

Message body:

```text
{district} reports {event_name} as {event_status}.

Report type: {report_type}
Report effective time: {report_effective_time}
Current situation: {current_situation}
Members not accounted for: {members_not_accounted_for}
Members requesting assistance: {members_requesting_assistance}
Next report due: {next_report_due}

This message reflects the latest reported district status and may change as additional information is received.
```

Required variables:

- `district`
- `event_name`
- `event_status`
- `report_type`
- `report_effective_time`
- `current_situation`
- `next_report_due`

## Template 2. Accountability Follow-Up

Template ID: `tmpl-accountability-followup`

Use when:

- TRG-02 fires

Audience:

- Accountability managers or authorized incident operators

Subject:

`Accountability follow-up for {district} during {event_name}`

Message body:

```text
{district} reports accountability concerns related to {event_name}.

Members not accounted for: {members_not_accounted_for}
Members requesting assistance: {members_requesting_assistance}
Current situation: {current_situation}
Next report due: {next_report_due}

Do not use this message as a source of personal details. Follow established accountability procedures for case-level handling.
```

Required variables:

- `district`
- `event_name`
- `members_not_accounted_for`
- `current_situation`

## Template 3. Assistance Escalation

Template ID: `tmpl-assistance-escalation`

Use when:

- TRG-03 fires

Audience:

- National emergency management leadership

Subject:

`Assistance escalation for {district} during {event_name}`

Message body:

```text
{district} reports an increase in members requesting assistance during {event_name}.

Members requesting assistance: {members_requesting_assistance}
Open assistance cases: {open_assistance_cases}
Current situation: {current_situation}
Leadership attention summary: {leadership_attention_summary}

Review district assistance requirements and determine whether additional coordination is needed.
```

Required variables:

- `district`
- `event_name`
- `members_requesting_assistance`
- `open_assistance_cases`

## Template 4. Urgent Resource Request

Template ID: `tmpl-urgent-resource-request`

Use when:

- TRG-04 fires

Audience:

- National coordination or logistics audience

Subject:

`Urgent resource request from {district} for {event_name}`

Message body:

```text
{district} requests urgent support for {event_name}.

Requested capability: {requested_capability}
Requested quantity: {requested_quantity}
Priority: {requested_priority}
Needed by: {needed_by}
Current situation: {current_situation}

Review sourcing options and assign supporting organization if approved.
```

Required variables:

- `district`
- `event_name`
- `requested_capability`
- `requested_quantity`
- `requested_priority`
- `needed_by`

## Template 5. Leadership Decision Request

Template ID: `tmpl-leadership-decision-request`

Use when:

- TRG-05 fires

Audience:

- Q leadership or designated decision authority

Subject:

`Leadership attention required for {district} during {event_name}`

Message body:

```text
{district} requires leadership attention for {event_name}.

Summary: {leadership_attention_summary}
Current situation: {current_situation}
Members not accounted for: {members_not_accounted_for}
Next report due: {next_report_due}

Please review and provide the needed decision, approval, or escalation direction.
```

Required variables:

- `district`
- `event_name`
- `leadership_attention_summary`
- `current_situation`

## Template 6. Reporting Reminder

Template ID: `tmpl-reporting-reminder`

Use when:

- TRG-06 fires

Audience:

- Reporting unit or district operator

Subject:

`SITREP update overdue for {district} on {event_name}`

Message body:

```text
The next SITREP update for {district} on {event_name} is overdue.

Next report due: {next_report_due}
Last report effective time: {report_effective_time}
Current event status: {event_status}

Submit an updated SITREP or confirm reporting status if no change is required.
```

Required variables:

- `district`
- `event_name`
- `next_report_due`
- `report_effective_time`
- `event_status`

## Approval Workflow

1. Trigger is detected by the rules engine.
2. Required variables are validated.
3. Dedupe hash is checked.
4. Draft is created in Everbridge or operator task is generated.
5. ArcGIS record is updated with `Approval_Status = pending-review`.
6. Authorized operator reviews audience channels and wording.
7. Operator approves, edits, launches, or rejects.

## Review Checklist for Operators

- Verify event and district correlation.
- Verify intended audience.
- Verify message content does not expose PII.
- Verify channels and urgency level match operational need.
- Verify message is not a duplicate of an already active communication.

## Recommended Initial Production Scope

- Enable TRG-01 through TRG-05 in manual draft mode only.
- Leave TRG-06 as manual until reminder cadence is validated.
- Add TRG-07 only after feed quality and intersection logic are tested.