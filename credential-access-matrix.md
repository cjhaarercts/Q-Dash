# Platform Credential and Access Matrix

## Purpose

This document defines the minimum credential sets, ownership, scope, and storage locations required to operate the ArcGIS, Everbridge, and AWS portions of the SITREP integration.

## Principles

- Do not send or store secrets in chat, markdown notes, or client-side code.
- Use dedicated service identities, not personal user accounts.
- Grant the minimum permissions needed for each integration function.
- Store runtime secrets in AWS Secrets Manager.
- Separate development, test, and production credentials.

## Credential Matrix

| Platform | Credential purpose | Identity type | Minimum scope | Storage location | Owner | Rotation owner |
| --- | --- | --- | --- | --- | --- | --- |
| AWS | Infrastructure deployment | IAM role or federated admin | Provision API Gateway, Lambda, DynamoDB, SQS, CloudWatch, Secrets Manager | AWS IAM | Cloud platform owner | Cloud platform owner |
| AWS | Lambda runtime access | IAM execution role | Access only assigned secrets, logs, tables, queues, and network resources | AWS IAM | Integration lead | Cloud platform owner |
| ArcGIS | Feature layer read and write | Service account or OAuth app | Read SITREP layer, write related table, update integration fields | AWS Secrets Manager | ArcGIS lead | ArcGIS lead |
| ArcGIS | Webhook configuration | Service account or admin app | Create and manage Survey123 or hosted-layer webhooks | AWS Secrets Manager or ArcGIS admin vault | ArcGIS lead | ArcGIS lead |
| ArcGIS | Hazard feed read access | Service account if feed is restricted | Read target feed items or feature layers | AWS Secrets Manager | ArcGIS lead | ArcGIS lead |
| Everbridge | Notification polling | Dedicated API account | Read notification metadata and aggregate results | AWS Secrets Manager | Everbridge lead | Everbridge lead |
| Everbridge | Callback or webhook signing | Tenant-level shared secret or signing config | Validate callback authenticity | AWS Secrets Manager | Everbridge lead | Everbridge lead |
| Everbridge | Draft creation | Dedicated API account | Create drafts, read draft status, no unrestricted launch authority in pilot | AWS Secrets Manager | Everbridge lead | Everbridge lead |
| Q-Drive or M365 | Optional document metadata lookup | App registration or service account | Read shared document metadata only if later required | AWS Secrets Manager | Product owner | M365 admin |

## Identity Recommendations

### AWS

- Use federated administrative access for setup, not shared IAM users.
- Give each Lambda function its own execution role.
- Use separate roles for infrastructure deployment and runtime execution.

### ArcGIS

- Prefer a dedicated integration service account or app registration.
- Keep publishing permissions separate from runtime writer permissions when possible.
- Avoid using a personal ArcGIS admin account for ongoing automation.

### Everbridge

- Use a dedicated integration API account.
- Separate read-only polling capability from draft-creation capability if the tenant role model supports it.
- Avoid granting launch permissions to the draft-creation identity during pilot phases.

## Environment Separation

Each environment should have its own identities and secrets:

- `dev`
- `test`
- `prod`

Do not reuse production credentials in test.

## Required Permission Checklist

### ArcGIS runtime writer

- Read SITREP records
- Update SITREP integration fields
- Create or update `Everbridge_Notification_Log` rows
- Read layer metadata and schema

### ArcGIS admin configurator

- Create and manage webhooks
- Publish or update Survey123 form items
- Modify hosted layer schema
- Manage sharing on items in scope

### Everbridge polling account

- Read notification status
- Read aggregate delivery metrics
- Read aggregate accountability metrics

### Everbridge draft creator

- Create draft notifications
- Read draft IDs and statuses
- Read templates if template-based API calls are required
- No launch permission unless specifically approved later

### AWS runtime roles

- Read only the secrets needed by each function
- Write to CloudWatch logs
- Access assigned DynamoDB tables
- Send to assigned SQS dead-letter queues
- Invoke only downstream Lambda functions required by the flow

## Rotation Guidance

- ArcGIS and Everbridge secrets should be rotated at least annually, or sooner if required by policy.
- Webhook shared secrets should be rotated whenever a receiver is re-provisioned or compromise is suspected.
- AWS IAM roles should rely on short-lived credentials rather than static keys whenever possible.

## Approval Requirements Before Provisioning

- Confirm named owner for each platform identity.
- Confirm whether Everbridge draft creation must be isolated from polling in separate accounts.
- Confirm whether ArcGIS uses service accounts, OAuth apps, or both.