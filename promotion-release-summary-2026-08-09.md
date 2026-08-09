# Promotion Release Summary - 2026-08-09

## Scope

This release completed promotion hardening and strict verification for `test` and `prod` environments.

## Implemented Changes

- Added apply guardrails in `infra/terraform/run-strict-verify.ps1`:
  - Forced `-SkipApply` in `test`/`prod` unless `-AllowApply` is explicitly set.
  - Added explicit forwarding of `-AllowApply` to `deploy-verify.ps1`.
- Added defense-in-depth in `infra/terraform/deploy-verify.ps1`:
  - Guarded promoted apply path with workspace/environment match checks.
  - Added workspace warning/reporting for non-apply runs.
  - Added `-SkipOutputChecks` for readiness-only runs against fresh workspaces.
  - Added safer Terraform output retrieval with explicit error messages.
- Updated Terraform in `infra/terraform/main.tf`:
  - Set deterministic Lambda log group names.
  - Added Lambda `logging_config` to reference managed log groups.
- Updated documentation:
  - `README.md` with guardrail behavior, override usage, readiness guidance.
  - `aws-observability-verification-runbook.md` with import reconciliation procedure for pre-existing log groups.

## Promotion Validation Results

- `test` strict apply verification: PASS
- `prod` strict apply verification: PASS

Evidence artifacts:

- `infra/terraform/reports/deploy-verify-test-strict-live-summary.csv`
- `infra/terraform/reports/deploy-verify-test-strict-live.csv`
- `infra/terraform/reports/deploy-verify-prod-strict-live-summary.csv`
- `infra/terraform/reports/deploy-verify-prod-strict-live.csv`

## Notable Incident and Resolution

- Issue: `prod` apply failed with `ResourceAlreadyExistsException` for `/aws/lambda/sitrep-int-prod-everbridge-poller` log group.
- Resolution: imported existing log group into `prod` Terraform workspace state with PowerShell-safe syntax:

```powershell
terraform -chdir=infra/terraform workspace select prod
terraform -chdir=infra/terraform --% import -var-file=terraform.prod.tfvars aws_cloudwatch_log_group.lambda["everbridge_poller"] /aws/lambda/sitrep-int-prod-everbridge-poller
```

## Suggested Commit Message

```text
Harden promotion verification and complete test/prod strict apply validation

- add apply guardrails and explicit allow-apply override flow
- enforce workspace checks for promoted apply paths
- add readiness mode with SkipOutputChecks for fresh workspaces
- stabilize lambda log group handling and logging config dependencies
- document log group state-reconciliation/import procedure
- validate strict apply success in test and prod with evidence CSVs
```

## Git Prerequisite Note

This workspace currently has no `.git` directory. To commit these changes, run from the actual repository root or initialize/connect this folder to the intended git remote first.
