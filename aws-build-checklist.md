# AWS Build Checklist for ArcGIS and Everbridge Integration

## Purpose

This checklist converts the target architecture into a concrete build sequence for a technical team. It is organized by deployment order and includes completion criteria.

## Build Assumptions

- AWS account, networking, and baseline security controls already exist.
- ArcGIS service account and Everbridge API credentials will be provisioned separately.
- Initial release supports dashboard enrichment first, then draft creation.

## Phase 1. Foundation

### 1. Create AWS naming and tagging standard

Tasks:

- Define environment prefixes: `dev`, `test`, `prod`
- Define application prefix: `sitrep-int`
- Define common tags: `Application`, `Environment`, `Owner`, `DataClass`, `CostCenter`

Done when:

- Naming and tagging standard is documented and adopted in deployment templates.

### 2. Create IAM roles and policies

Tasks:

- Create Lambda execution roles for inbound handlers, pollers, writers, and draft creators.
- Restrict Secrets Manager access by function.
- Restrict DynamoDB table access by function need.
- Restrict CloudWatch and SQS permissions to least privilege.

Done when:

- Each function has a dedicated execution role.
- No wildcard admin permissions remain.

### 3. Create secrets in Secrets Manager

Secrets:

- `sitrep-int/dev/arcgis`
- `sitrep-int/dev/everbridge`
- `sitrep-int/dev/webhook-secrets`
- repeat for `test` and `prod`

Done when:

- All required secrets exist with rotation ownership assigned.

## Phase 2. Data and Queue Layer

### 4. Create DynamoDB tables

Tables:

- `sitrep-int-correlation`
- `sitrep-int-processing-ledger`
- `sitrep-int-feed-dedup`

Recommended keys:

- Correlation table: `pk`, `sk`
- Ledger table: `correlation_id`
- Feed dedup table: `source_key`

Suggested attributes:

- `event_id`
- `district`
- `source_system`
- `source_record_id`
- `notification_id`
- `dedupe_hash`
- `approval_status`
- `last_processed_utc`

Done when:

- Tables exist with point-in-time recovery enabled.

### 5. Create dead-letter queues

Queues:

- `sitrep-int-arcgis-dlq`
- `sitrep-int-everbridge-dlq`
- `sitrep-int-rules-dlq`

Done when:

- Failed messages can be retained and inspected without data loss.

## Phase 3. Inbound API Layer

### 6. Create API Gateway routes

Routes:

- `POST /webhooks/arcgis/sitrep`
- `POST /webhooks/everbridge/notification`
- Optional `GET /health`

Tasks:

- Enable TLS only.
- Apply rate limits.
- Configure request logging.
- Configure secret validation or Lambda authorizer.

Done when:

- Test requests reach the correct Lambda integrations and failed authentication is rejected.

### 7. Build `arcgisWebhookHandler`

Responsibilities:

- Validate secret.
- Normalize payload.
- Extract object ID, global ID, district, event ID, and changed fields.
- Write processing ledger entry.
- Invoke rules evaluation.

Done when:

- A valid test webhook returns acknowledgment and logs a correlation ID.

### 8. Build `everbridgeCallbackHandler`

Responsibilities:

- Validate source.
- Extract notification ID and external reference.
- Trigger detail refresh job.
- Write processing ledger entry.

Done when:

- A valid callback triggers a detail lookup workflow.

## Phase 4. Pollers and Rules Engine

### 9. Build `everbridgePoller`

Responsibilities:

- Query recent Everbridge notifications by time window.
- Retrieve aggregate recipient outcome data.
- Normalize results for ArcGIS write operations.

Done when:

- Poller can retrieve at least one test notification summary and map it to the normalized model.

### 10. Build `hazardFeedPoller`

Responsibilities:

- Query configured ArcGIS hazard feeds.
- Track prior state.
- Emit only new or materially changed events.

Done when:

- Test feed events are deduplicated and severity filtering is demonstrable.

### 11. Build `rulesEvaluator`

Responsibilities:

- Apply trigger matrix.
- Enforce exclusions.
- Compute dedupe hash.
- Decide whether to write dashboard updates only, create a draft, or suppress action.

Done when:

- Test cases exist for each approved trigger and suppression scenario.

## Phase 5. Writers and Outbound Integration

### 12. Build `arcgisWriter`

Responsibilities:

- Upsert `Everbridge_Notification_Log` rows.
- Update SITREP integration fields.
- Mark `Source_System` for integration-originated writes.

Done when:

- ArcGIS related table updates succeed in test without creating loops.

### 13. Build `everbridgeDraftCreator`

Responsibilities:

- Create draft notifications or operator review tasks.
- Populate approved templates with mapped variables.
- Return notification ID and draft status.

Done when:

- A qualifying SITREP event creates a draft and stores returned metadata.

## Phase 6. Scheduling and Monitoring

### 14. Configure EventBridge schedules

Schedules:

- Active incidents poll every 5 minutes
- Monitoring incidents poll every 15 minutes
- Hazard feed poll every 5 to 15 minutes depending on source rate

Done when:

- Poll schedules run in test and produce expected invocations.

### 15. Configure CloudWatch dashboards and alarms

Metrics:

- Webhook successes and failures
- Poll latency
- ArcGIS write failures
- Everbridge draft creation failures
- DLQ depth
- Deduplication suppression count

Alarms:

- Consecutive poll failures
- Authentication failures above threshold
- Queue depth above threshold
- Lambda error rate above threshold

Done when:

- On-call owner receives actionable alarms in test.
- Dashboard, effective alarm output, and Logs Insights verification steps are captured in the AWS observability verification runbook.

## Phase 7. Security and Recovery

### 16. Implement audit logging

Audit events should capture:

- Correlation ID
- Source system
- Trigger type
- Decision outcome
- Notification ID if created
- Operator status if applicable
- Timestamp

Done when:

- A single event can be traced end to end across logs.

### 17. Run failure recovery tests

Scenarios:

- ArcGIS API unavailable
- Everbridge API unavailable
- Invalid webhook secret
- Duplicate notification callback
- Correlation failure

Done when:

- Recovery actions are documented and DLQ handling is verified.

## Recommended Build Order

1. Foundation and secrets
2. DynamoDB and SQS
3. API Gateway and inbound handlers
4. Everbridge poller
5. ArcGIS writer
6. Rules evaluator
7. Everbridge draft creator
8. Hazard feed poller
9. Monitoring, alarms, and recovery testing

## Minimum Technical Deliverable for Release 2

- API Gateway routes live in test
- Everbridge poller working
- ArcGIS related-table writer working
- Correlation and dedupe basics working
- Monitoring and DLQ configured

This is sufficient to support Everbridge-to-dashboard ingestion before draft automation is enabled.
