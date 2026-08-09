# ArcGIS and Everbridge Integration API Contracts

## Purpose

This document defines the initial API contracts, payload expectations, and processing rules for the AWS integration service that sits between ArcGIS and Everbridge.

## Contract Principles

- All timestamps should be normalized to UTC in the integration layer.
- All inbound requests must be authenticated or validated with a shared secret.
- ArcGIS-originated events are advisory until the integration service evaluates business rules.
- Everbridge-originated events must be normalized to aggregate operational data before writing back to ArcGIS.

## External Interfaces

### 1. ArcGIS webhook receiver

Method: `POST`

Path: `/webhooks/arcgis/sitrep`

Purpose:

- Receive Survey123 or hosted feature layer create and update events.

Expected headers:

- `Content-Type: application/json`
- `X-ArcGIS-Webhook-Secret: <shared-secret>` or equivalent configured validator

Normalized payload model:

```json
{
  "sourceSystem": "ArcGIS",
  "eventType": "feature.updated",
  "receivedAtUtc": "2026-08-06T15:00:00Z",
  "layerName": "DistrictSITREP",
  "objectId": 142,
  "globalId": "{11111111-2222-3333-4444-555555555555}",
  "eventId": "2026-HUR-04",
  "district": "D7",
  "reportType": "update",
  "changedFields": [
    "event_status",
    "members_not_accounted_for",
    "leadership_attention_required"
  ],
  "record": {
    "event_status": "active_response",
    "members_not_accounted_for": 4,
    "leadership_attention_required": "yes",
    "leadership_attention_summary": "Need national sourcing decision for air assets.",
    "next_report_due": "2026-08-06T18:00:00Z"
  }
}
```

Processing rules:

- Reject requests with missing secret or invalid signature.
- Ignore events with `sourceSystem = EverbridgeSync`.
- Compute material-change hash from triggering fields.
- If eligible, create an internal rule evaluation event.

Response:

```json
{
  "accepted": true,
  "correlationId": "arcgis-142-20260806T150000Z",
  "action": "evaluate-rules"
}
```

### 2. Everbridge callback receiver

Method: `POST`

Path: `/webhooks/everbridge/notification`

Purpose:

- Receive notification lifecycle updates from Everbridge when supported.

Expected headers:

- `Content-Type: application/json`
- Tenant-specific signature or shared secret header

Normalized payload model:

```json
{
  "sourceSystem": "Everbridge",
  "eventType": "notification.updated",
  "receivedAtUtc": "2026-08-06T15:02:00Z",
  "notificationId": "EB-987654",
  "externalReference": "2026-HUR-04:D7:accountability",
  "status": "active"
}
```

Processing rules:

- Validate signature or shared secret.
- Call Everbridge detail endpoint to retrieve authoritative aggregates.
- Upsert related ArcGIS table record.

Response:

```json
{
  "accepted": true,
  "correlationId": "everbridge-EB-987654",
  "action": "refresh-notification-detail",
  "details": {
    "metrics": {
      "totalCallbacks": 1,
      "suppressedCount": 0,
      "writeCount": 1,
      "callbackStatusCounts": {
        "active": 1
      },
      "suppressionReasonCounts": {}
    }
  }
}
```

Callback responses include a lightweight `metrics` block so operators can distinguish written callbacks from duplicate suppressions and see the incoming callback status mix.

### 3. Everbridge polling contract

Scheduler invokes internal Lambda on a configured cadence.

Input model:

```json
{
  "mode": "active",
  "windowMinutes": 5,
  "notificationTypes": ["accountability", "notification", "recall"]
}
```

Expected outputs:

- List of new or updated notifications
- Aggregated recipient outcome counts
- Current notification state
- Launch timestamp and title

Response example:

```json
{
  "processed": true,
  "mode": "active",
  "windowMinutes": 5,
  "metrics": {
    "totalNotifications": 2,
    "writeCount": 1,
    "skippedCount": 1,
    "notificationStatusCounts": {
      "active": 2
    },
    "suppressionReasonCounts": {
      "duplicate-poll-notification": 1
    }
  },
  "notifications": [
    {
      "notificationId": "EB-987654",
      "notificationStatus": "active",
      "eventId": "2026-HUR-04",
      "district": "D7"
    },
    {
      "notificationId": "EB-987654",
      "notificationStatus": "active",
      "skipped": true,
      "reason": "duplicate-poll-notification"
    }
  ]
}
```

Polling responses include a `metrics` block summarizing writes, suppressions, and notification status counts for the poll window.

### 3a. Hazard feed polling contract

Scheduler invokes internal Lambda on a configured cadence.

Input model:

```json
{
  "feedName": "nhc"
}
```

Configured feed model from ArcGIS runtime secret:

```json
{
  "hazardDistrictLookup": {
    "layerUrl": "https://services.arcgis.com/.../FeatureServer/2",
    "districtField": "district_code",
    "eventIdField": "current_event_id",
    "eventNameField": "current_event_name",
    "where": "active = 1",
    "inSR": 4326
  },
  "name": "nhc",
  "url": "https://example.gov/hazards/feed.json",
  "eventId": "2026-HUR-04",
  "district": "D7",
  "eventName": "Hurricane Alpha",
  "minSeverity": "moderate",
  "districtAreas": [
    {
      "name": "District 7 AOI",
      "district": "D7",
      "eventId": "2026-HUR-04",
      "eventName": "Hurricane Alpha",
      "bounds": {
        "minX": -81,
        "minY": 25,
        "maxX": -79,
        "maxY": 27
      }
    }
  ]
}
```

Processing rules:

- Fetch the configured JSON feed.
- Normalize features from `features`, `results`, or a top-level array.
- When `districtAreas` is configured, derive district relevance from feature geometry or bbox using configured polygons first, then configured bounding boxes.
- When feed-local district mapping does not resolve, optionally query the configured ArcGIS district layer using the hazard geometry center.
- Reuse ArcGIS district lookup results within the same poll run for nearby hazards that resolve to the same lookup cell.
- Persist recent ArcGIS district lookup results in the state store for short-lived reuse across poll invocations.
- Suppress inactive, expired, low-severity, or duplicate hazard updates.
- Create a manual Everbridge draft when a qualifying feature resolves to an `eventId` and district.

Expected response model:

```json
{
  "processed": true,
  "feedName": "nhc",
  "metrics": {
    "totalUpdates": 1,
    "actionCounts": {
      "draft-created": 1
    },
    "correlationSourceCounts": {
      "feed_defaults": 1
    },
    "suppressionReasonCounts": {}
  },
  "drafts": [
    {
      "featureId": "HZ-1",
      "notificationId": "EB-HAZ-1",
      "district": "D7",
      "eventId": "2026-HUR-04"
    }
  ],
  "updates": [
    {
      "feedName": "nhc",
      "featureId": "HZ-1",
      "eventId": "2026-HUR-04",
      "district": "D7",
      "correlationSource": "feed_defaults",
      "action": "draft-created",
      "notificationId": "EB-HAZ-1"
    }
  ]
}
```

`correlationSource` indicates how the event and district were resolved. Current values include `feed_feature`, `feed_defaults`, `configured_district_bounds`, `configured_district_polygon`, `arcgis_district_lookup_live`, `arcgis_district_lookup_run_cache`, and `arcgis_district_lookup_persisted_cache`.

`metrics` provides lightweight per-poll counters for actions taken, correlation source mix, and suppression reasons.

### 4. ArcGIS writer contract

Method: internal service call or ArcGIS REST API request

Purpose:

- Write Everbridge aggregate data into `Everbridge_Notification_Log`
- Update SITREP record integration fields when outbound rules run

Upsert model for `Everbridge_Notification_Log`:

```json
{
  "event_id": "2026-HUR-04",
  "district": "D7",
  "eb_notification_id": "EB-987654",
  "notification_type": "accountability",
  "notification_title": "Hurricane Alpha Accountability",
  "launch_time_utc": "2026-08-06T14:55:00Z",
  "targeted_count": 2400,
  "delivered_count": 2327,
  "failed_count": 18,
  "confirmed_safe": 1905,
  "assistance_requested": 11,
  "no_response": 411,
  "notification_status": "active",
  "last_sync_utc": "2026-08-06T15:02:30Z",
  "source_system": "EverbridgeSync"
}
```

### 5. Leadership visualization and drill-down contract

Method: internal service call backed by ArcGIS feature and related-table reads

Purpose:

- Provide leadership-focused `who`, `what`, `where`, and `how-many` views.
- Provide district heat map rendering inputs.
- Support simultaneous multi-hazard filtering and overlap-aware totals.

Request model:

```json
{
  "eventId": "2026-HUR-04",
  "hazards": ["hurricane", "flood"],
  "districts": ["D7", "D8"],
  "confidenceStates": ["potential", "reported", "confirmed"],
  "timeWindowHours": 24,
  "includeHeatMap": true,
  "includeDistrictDetails": true
}
```

Response model:

```json
{
  "eventId": "2026-HUR-04",
  "generatedAtUtc": "2026-08-09T14:00:00Z",
  "whoWhatWhereHowMany": {
    "who": {
      "potentiallyAffectedMembers": 2400,
      "reportedMembers": 1980
    },
    "what": {
      "hazards": ["hurricane", "flood"],
      "activeNotifications": 3
    },
    "where": {
      "districts": ["D7", "D8"],
      "overlapDistricts": ["D7"]
    },
    "howMany": {
      "unaccountedFor": 47,
      "needingHelp": 12,
      "needingHelpContacted": 9
    }
  },
  "confidence": {
    "state": "reported",
    "sourceMix": {
      "hazard_inferred": 1,
      "sitrep_confirmed": 2,
      "everbridge_confirmed": 1
    }
  },
  "heatMap": {
    "metric": "unaccountedFor",
    "buckets": [
      { "label": "0", "min": 0, "max": 0 },
      { "label": "1-5", "min": 1, "max": 5 },
      { "label": "6-20", "min": 6, "max": 20 },
      { "label": "21+", "min": 21, "max": 999999 }
    ],
    "districtValues": [
      {
        "district": "D7",
        "hazards": ["hurricane", "flood"],
        "counts": {
          "unaccountedFor": 33,
          "needingHelp": 10,
          "needingHelpContacted": 7
        },
        "confidenceState": "reported",
        "overlapRisk": "high"
      }
    ]
  },
  "districtDetails": [
    {
      "district": "D7",
      "eventId": "2026-HUR-04",
      "hazards": ["hurricane", "flood"],
      "latestUpdateUtc": "2026-08-09T13:54:00Z",
      "source": "SitRep",
      "everbridgeNotificationIds": ["2666867063786182"],
      "counts": {
        "unaccountedFor": 33,
        "needingHelp": 10,
        "needingHelpContacted": 7
      },
      "drillDown": {
        "recordCount": 5,
        "confidenceState": "reported",
        "provenance": ["hazard-inferred", "sitrep-confirmed"]
      }
    }
  ],
  "deduplication": {
    "overlapDeconflicted": true,
    "overlapMethod": "member-id-unique-count",
    "doubleCountRisk": "low"
  }
}
```

Processing rules:

- Support multiple hazards in a single query and preserve both combined and per-hazard counts.
- Mark hazard-only estimates as `potential` until a SitRep or direct operational confirmation arrives.
- Include `everbridgeNotificationIds` per district when available for communication traceability.
- When hazards overlap geographically, produce deconflicted totals and expose overlap-risk metadata.
- Return district drill-down payloads with source and confidence context so leadership can validate fast.

### 5. Everbridge draft creation contract

Method: internal service call to Everbridge REST API

Purpose:

- Create a notification draft or operator-review task based on ArcGIS rules

Draft request model:

```json
{
  "eventId": "2026-HUR-04",
  "district": "D7",
  "messageType": "district_status_update",
  "approvalMode": "manual",
  "templateId": "tmpl-district-status-update",
  "templateVariables": {
    "district": "D7",
    "event_name": "Hurricane Alpha",
    "event_status": "Active Response",
    "members_not_accounted_for": 4,
    "members_requesting_assistance": 2,
    "next_report_due": "2026-08-06T18:00:00Z",
    "leadership_attention_summary": "Need national sourcing decision for air assets."
  },
  "dedupeHash": "b8eec0d9b8f7f2e9"
}
```

Expected response model:

```json
{
  "created": true,
  "notificationId": "EB-987655",
  "status": "draft",
  "approvalStatus": "pending-review"
}
```

## Internal Rule Evaluation Contract

Input model:

```json
{
  "correlationId": "arcgis-142-20260806T150000Z",
  "eventId": "2026-HUR-04",
  "district": "D7",
  "triggerType": "sitrep_update",
  "changedFields": ["members_not_accounted_for", "leadership_attention_required"],
  "record": {
    "members_not_accounted_for": 4,
    "leadership_attention_required": "yes",
    "request_status": "open",
    "requested_priority": "urgent"
  }
}
```

Decision model:

```json
{
  "shouldCreateDraft": true,
  "messageType": "district_status_update",
  "reason": "Members not accounted for is greater than zero and leadership attention is required.",
  "dedupeHash": "b8eec0d9b8f7f2e9",
  "updates": {
    "integration_processed": true,
    "notification_eligible": true,
    "approval_status": "pending-review"
  }
}
```

## Recommended Trigger Matrix

| Trigger | Condition | Action |
| --- | --- | --- |
| Active response entered | `event_status = active_response` | Create draft for district leadership update |
| Accountability concern | `members_not_accounted_for > 0` | Create accountability follow-up draft |
| Assistance demand rises | `members_requesting_assistance` increases materially | Create operator review task |
| Urgent resource request | `requested_priority = urgent` and `request_status = open` | Create leadership coordination draft |
| Leadership attention | `leadership_attention_required = yes` | Create leadership escalation draft |
| Overdue SITREP | `now > next_report_due` | Create administrative reminder |

## Deduplication Rules

- Build hash from `eventId`, `district`, `messageType`, and normalized message content.
- Suppress duplicate draft creation for the same hash within the same operational period unless a material field changes.
- Store hash and last result in DynamoDB and optionally in ArcGIS integration fields.

## Error Contract

Standard error response:

```json
{
  "accepted": false,
  "correlationId": "arcgis-142-20260806T150000Z",
  "errorCode": "INVALID_SECRET",
  "message": "Webhook authentication failed."
}
```

## Non-Functional Requirements

- Inbound webhook acknowledgment target: under 3 seconds
- Polling cycle target for active incidents: under 5 minutes
- All mutation actions must emit audit logs
- All failures after retry exhaustion must land in a dead-letter queue