# SITREP Integration Service Scaffold

This workspace now includes a minimal implementation scaffold for the AWS-hosted integration layer described in the planning documents.

## Included Structure

- `infra/terraform`: Terraform skeleton for API Gateway, Lambda, DynamoDB, SQS, EventBridge, and Secrets Manager references.
- `src/handlers`: Lambda entrypoints for ArcGIS, Everbridge, polling, rules, write, and hazard feed flows.
- `src/lib`: shared configuration, HTTP clients, persistence helpers, logging, and response helpers.

## Intended Use

1. Populate AWS Secrets Manager using the secure onboarding documents.
2. Replace placeholder values in `infra/terraform/terraform.tfvars.example`.
3. Expand handler internals to call ArcGIS and Everbridge APIs.
4. Deploy non-production infrastructure first.

## Quick Validation

- `npm run check` validates JavaScript syntax for the handler files.
- `npm test` runs built-in regression tests for payload normalization, trigger selection, and guarded webhook handling.
- `npm run tf:validate` validates the Terraform configuration from the repo root.
- `npm run tf:plan:dev`, `npm run tf:plan:test`, and `npm run tf:plan:prod` run Terraform plans against the environment example overlays.
- `npm run verify:strict:dev`, `npm run verify:strict:test`, and `npm run verify:strict:prod` run the strict deploy verification wrapper with environment-specific report names.
- `pwsh -File infra/terraform/watch-checkpoint.ps1` captures a timestamped post-promotion watch checkpoint (alarms, dashboards, and selected prod logs).
- `pwsh -File infra/terraform/watch-rollup.ps1` summarizes checkpoint results for the active watch window.
- `terraform validate` can be run inside `infra/terraform` after Terraform is installed and the provider plugins are initialized.

### Rerun All Dashboard Validations

Run the full dashboard validation suite and generate evidence artifacts:

```powershell
npm run dashboard:validate-functional -- --summary infra/terraform/reports/dashboard-summary-sample-response.json --hazard infra/terraform/reports/dashboard-hazard-comparison-sample-response.json --drilldown infra/terraform/reports/dashboard-drilldown-trace-sample-response.json --callback-latency-seconds 900
```

Check release cutover readiness (cutover package completeness, evidence files, clean git state, and release tag):

```powershell
npm run dashboard:cutover:ready -- v0.2.2
```

Run the hybrid release flow (preflight, functional validation, operator packet, post-publish URL check):

```powershell
npm run dashboard:release:hybrid -- -ReleaseTag v0.2.2
```

## Strict Verification Profile

- `infra/terraform/run-strict-verify.ps1` wraps `deploy-verify.ps1` with `-StrictHazardSmoke` enabled and writes a deterministic report path by environment.
- Default strict threshold is `HazardMinUpdates=1`; override with `-HazardMinUpdates <n>` when needed.
- Safety guard: for `test` and `prod`, the wrapper forces `-SkipApply` unless `-AllowApply` is explicitly provided.
- Defense in depth: `infra/terraform/deploy-verify.ps1` also blocks apply in `test` and `prod` unless `-AllowApply` is explicitly provided.
- Workspace isolation guard: for `test` and `prod`, `deploy-verify.ps1` requires the active Terraform workspace to match the environment name before apply.
- Readiness-only runs against a fresh workspace can use `deploy-verify.ps1 -SkipOutputChecks` to bypass output assertions before first apply.
- Example for dev with safe no-apply mode:
  - `pwsh -File infra/terraform/run-strict-verify.ps1 -Environment dev -SkipBootstrap -SkipTests -SkipApply -HazardMinUpdates 1`
- Example for prod with explicit apply override:
  - `pwsh -File infra/terraform/run-strict-verify.ps1 -Environment prod -HazardMinUpdates 1 -AllowApply`
- Before any explicit apply override in `test` or `prod`, select the matching Terraform workspace, for example:
  - `terraform -chdir=infra/terraform workspace select prod`

## Release Notes (2026-08-09)

- Added strict promotion safety guardrails:
  - `infra/terraform/run-strict-verify.ps1` now forces `-SkipApply` for `test` and `prod` unless `-AllowApply` is explicitly set.
  - `infra/terraform/deploy-verify.ps1` now enforces the same apply protection for direct invocations.
  - Deploy preflight reporting now records an `apply-guard` row to make apply safety state explicit in exported CSV reports.
  - Apply-authorized prod validation from workspace `default` now fails closed before apply with a clear workspace guard error.
  - Apply-authorized test validation from workspace `default` also fails closed before apply with the same workspace guard behavior.
  - Added `-SkipOutputChecks` for readiness-only verification, and validated a passing test readiness run with `active=test;expected=test` and apply skipped.
  - Validated the same passing readiness flow for prod with `active=prod;expected=prod`, `-AllowApply -SkipApply -SkipOutputChecks`, and no guard warning.
- Promotion verification status:
  - `dev` strict profile passed (`pass=15;fail=0;skipped=3`) with hazard strict check `totalUpdates=1;requiredMin=1`.
  - `test` strict profile passed (`pass=15;fail=0;skipped=3`) with hazard strict check `totalUpdates=1;requiredMin=1`.
  - `prod` strict profile passed (`pass=15;fail=0;skipped=3`) with hazard strict check `totalUpdates=1;requiredMin=1`.
- Report artifacts:
  - `infra/terraform/reports/deploy-verify-dev-strict-live-summary.csv`
  - `infra/terraform/reports/deploy-verify-test-strict-live-summary.csv`
  - `infra/terraform/reports/deploy-verify-prod-strict-live-summary.csv`

Notes:

- This workspace currently includes tracked secret payload files for `dev` only under `infra/terraform/secrets/dev`.
- Before running strict verification for `test` or `prod`, create and populate corresponding payload files under `infra/terraform/secrets/test` or `infra/terraform/secrets/prod`, then run bootstrap for that environment.

## Secret Bootstrap

- Copy the tracked example payloads under `infra/terraform/secrets/dev/*.example.json` to `.json` files in the same folder and fill in real values locally.
- Run `pwsh -File infra/terraform/bootstrap-secrets.ps1 -Environment dev -Region us-west-2` to create or update the AWS Secrets Manager entries and generate an ignored `infra/terraform/terraform.dev.tfvars` file with resolved secret ARNs.

## Observability

- Polling and callback handlers emit dedicated JSON metric events with stable names including `HazardFeedPollSummary`, `HazardMissingEventCorrelation`, `HazardDuplicateSuppression`, `EverbridgePollSummary`, `EverbridgePollDuplicateSuppression`, `EverbridgePollMissingEventCorrelation`, `EverbridgeCallbackSummary`, and `EverbridgeCallbackDuplicateSuppression`.
- Terraform now provisions Lambda log groups, CloudWatch log metric filters, and basic alarms for duplicate suppressions and hazard missing-event-correlation counts.
- Terraform also provisions a CloudWatch dashboard with separate hazard and Everbridge metric widgets plus an alarm-status view, all sourced from the same namespace and enabled alarm set.
- Set `alarm_notification_topic_arns` in `infra/terraform/terraform.tfvars.example` to route alarm and recovery notifications to SNS.
- Environment-aware alarm defaults now apply automatically: `dev` disables hazard duplicate alarms and relaxes Everbridge duplicate thresholds, `test` disables hazard duplicate alarms, and `prod` keeps all alarms enabled with stricter defaults.
- Use `operational_alarm_overrides` in `infra/terraform/terraform.tfvars.example` to tune or replace those environment defaults per alarm without editing the module.
- Terraform outputs now include `operational_alarm_effective_config` so deployments can inspect the final enabled state, thresholds, and evaluation settings after defaults and overrides are merged.
- Terraform outputs also include `operational_dashboard_name` so operators can open the generated dashboard directly after deployment.
- Terraform also provisions CloudWatch Logs Insights query definitions and exposes them via `observability_query_definition_names`.
- See `operational-observability.md` for the intended operator posture for each metric and alarm.
- See `aws-observability-verification-runbook.md` for Terraform apply, post-deploy checks, and CloudWatch Logs Insights queries.

## Current Limitations

- Terraform resources are safe scaffolds and will still need environment-specific values, packaging, and provider initialization.
- No platform credentials are stored in this workspace.
- Hazard feed polling supports configured district-area geometry and optional ArcGIS district-layer lookup for runtime correlation, with per-run and short-lived persisted lookup caching for clustered hazards. Poll results now expose correlation provenance and lightweight metrics so operators can see where correlation came from and why hazards were suppressed.
- Everbridge callback and polling flows now expose lightweight summary metrics in their responses, logs, and ledger records so duplicate suppressions and processed notification status mix are visible without additional tracing.
- Polling and callback handlers now also emit dedicated JSON metric log events with `eventType = "metric"`, stable `metricName` values, dimensional context, and flattened numeric counters for CloudWatch-style log queries or metric filters.
