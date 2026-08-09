# AWS Observability Verification Runbook

## Purpose

This runbook describes how to apply the Terraform stack for a target environment and verify that the operational metrics, alarms, dashboard, and log-derived signals are present in AWS.

## Preconditions

- AWS credentials for the target account are already configured.
- Required Secrets Manager entries exist for the target environment.
- The target environment has a reviewed tfvars file derived from the example overlays in `infra/terraform`.
- Terraform provider plugins are initialized.

Real `.tfvars` files should remain uncommitted; the repo ignores them and only tracks `*.example` overlays.

## Recommended Input Files

- `infra/terraform/terraform.tfvars.dev.example`
- `infra/terraform/terraform.tfvars.test.example`
- `infra/terraform/terraform.tfvars.prod.example`

## Deployment Steps

1. Select the target environment overlay and copy its values into a real `.tfvars` file that contains account-specific ARNs.
2. Run `terraform -chdir="infra/terraform" validate`.
3. Run `terraform -chdir="infra/terraform" plan -var-file="<target>.tfvars"` and review:
   - Lambda functions
   - Lambda log groups
   - CloudWatch log metric filters
   - CloudWatch alarms
   - CloudWatch dashboard
4. Run `terraform -chdir="infra/terraform" apply -var-file="<target>.tfvars"` after review approval.

## Post-Deploy Output Checks

Review these Terraform outputs immediately after apply:

- `api_base_url`
- `operational_alarm_names`
- `operational_alarm_effective_config`
- `operational_dashboard_name`
- `observability_query_definition_names`

Confirm:

- The dashboard name resolves in the deployed AWS region.
- Enabled alarms match the expected environment profile or approved overrides.
- Thresholds and periods in `operational_alarm_effective_config` match the change request.
- Deployed query definition names match the expected troubleshooting set.

## State Reconciliation for Pre-Existing Log Groups

Use this procedure when apply fails with ResourceAlreadyExistsException for a Lambda log group that already exists in CloudWatch Logs.

1. Confirm the active Terraform workspace matches the target environment.
2. Check whether Terraform already manages the log group address in state.
3. Verify the remote log group exists in AWS CloudWatch Logs.
4. Import the existing log group into the matching environment workspace state.
5. Re-run plan/apply for that environment.

Example commands for prod:

```powershell
terraform -chdir=infra/terraform workspace select prod
terraform -chdir=infra/terraform state list | Select-String "aws_cloudwatch_log_group.lambda"
aws logs describe-log-groups --region us-west-2 --log-group-name-prefix "/aws/lambda/sitrep-int-prod-everbridge-poller" --query "logGroups[].logGroupName" --output json
terraform -chdir=infra/terraform --% import -var-file=terraform.prod.tfvars aws_cloudwatch_log_group.lambda["everbridge_poller"] /aws/lambda/sitrep-int-prod-everbridge-poller
```

Notes:

- The --% flag is required in PowerShell to prevent argument parsing issues with resource addresses that include brackets and quotes.
- Always pass the environment var-file during import to ensure provider context (region/account variables) matches the deployment run.
- Do not run imports from the wrong workspace; that can reconcile state into the wrong environment.

## CloudWatch Verification

### Dashboard

- Open the dashboard from `operational_dashboard_name`.
- Confirm the page contains:
  - hazard metric widget
  - Everbridge metric widget
  - alarm-status widget

### Metric Filters

Confirm that log metric filters exist for the enabled signals in the environment:

- `HazardMissingEventCorrelation`
- `HazardDuplicateSuppression` when enabled
- `EverbridgePollDuplicateSuppression`
- `EverbridgePollMissingEventCorrelation`
- `EverbridgeCallbackDuplicateSuppression`

### Alarm Checks

- Confirm all expected alarms are present from `operational_alarm_names`.
- Confirm `State = OK` after deployment when no known test failures are active.
- Confirm SNS actions are attached when `alarm_notification_topic_arns` is non-empty.

## Logs Insights Queries

Terraform now provisions named query definitions for the standard troubleshooting views. Prefer opening those deployed definitions first, then fall back to the raw query text below when iterating.

### 1. Metric event stream

```sql
fields @timestamp, metricName, dimensions, values, context
| filter eventType = "metric"
| sort @timestamp desc
| limit 100
```

### 2. Correlation failures only

```sql
fields @timestamp, metricName, values.count, dimensions, context
| filter eventType = "metric"
| filter metricName like /MissingEventCorrelation/
| sort @timestamp desc
| limit 100
```

### 3. Duplicate suppressions only

```sql
fields @timestamp, metricName, values.count, dimensions, context
| filter eventType = "metric"
| filter metricName like /DuplicateSuppression/
| sort @timestamp desc
| limit 100
```

### 4. Handler summary logs

```sql
fields @timestamp, message, context
| filter message in ["Polling hazard feed workflow.", "Polling Everbridge notifications.", "Received Everbridge callback."]
| sort @timestamp desc
| limit 100
```

Expected query definition outputs:

- `metric_event_stream`
- `correlation_failures`
- `duplicate_suppressions`
- `handler_summaries`

## Functional Verification Scenarios

### Hazard missing-event-correlation

- Trigger or simulate a hazard update that does not match configured district areas and does not resolve through ArcGIS lookup.
- Confirm `HazardMissingEventCorrelation` appears in logs and the hazard widget.

### Everbridge poll missing-event-correlation

- Trigger or simulate a polled Everbridge notification with an invalid or incomplete `externalReference`.
- Confirm `EverbridgePollMissingEventCorrelation` appears in logs and the Everbridge widget.

### Duplicate suppression

- Replay the same hazard update or Everbridge callback in a short interval.
- Confirm the appropriate duplicate suppression metric appears and the related alarm behavior matches the environment profile.

### Leadership heat map and district drill-down (when enabled)

- Open the leadership visualization view for an active `event_id`.
- Confirm district heat map buckets render for the selected metric (`unaccounted_for`, `needing_help`, or `needing_help_contacted`).
- Select a district and confirm drill-down details show latest source, confidence state, and linked Everbridge notification ID values when available.

### Multi-hazard selection and overlap (when enabled)

- Select at least two simultaneous hazards for the same event.
- Confirm the view renders both combined totals and per-hazard totals.
- Confirm overlap markers appear for intersecting hazards and that deconflicted totals are used for leadership roll-up.
- Confirm the view surfaces a provisional or overlap-risk indicator when deconfliction is incomplete.

## Exit Criteria

- Terraform apply completes successfully.
- Dashboard loads and contains the expected grouped widgets.
- Enabled alarms exist with the intended thresholds and evaluation settings.
- At least one test metric event can be observed in CloudWatch logs.
- Operators can identify the dashboard and effective alarm output for the deployed environment.
