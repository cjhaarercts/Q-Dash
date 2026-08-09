# Secure Platform Onboarding Procedure

## Purpose

This runbook provides a step-by-step procedure for an administrator to provision platform access and securely populate credentials for the SITREP integration.

## Preconditions

- Governance decision record is accepted.
- Named owners exist for AWS, ArcGIS, and Everbridge identities.
- Environment names and AWS account targets are confirmed.
- No secrets will be shared through chat or stored in workspace files.

## Step 1. Create platform identities

### AWS

- Create deployment role or confirm federated admin access for infrastructure setup.
- Create runtime IAM roles defined in the IAM standard.
- Confirm CloudWatch, DynamoDB, SQS, and Lambda service permissions are available.

### ArcGIS

- Create runtime integration identity.
- Create admin configuration identity if separate from runtime.
- Confirm access to the SITREP feature layer, related table, Survey123 item, and webhook management capabilities.

### Everbridge

- Create polling identity.
- Create draft-creation identity if separate.
- Confirm role permissions align with pilot requirement of draft creation without unrestricted launch authority.

## Step 2. Create Secrets Manager entries

For each environment, create the following secrets:

- `/sitrep-int/<env>/arcgis/runtime`
- `/sitrep-int/<env>/arcgis/admin`
- `/sitrep-int/<env>/everbridge/polling`
- `/sitrep-int/<env>/everbridge/draft`
- `/sitrep-int/<env>/webhooks/arcgis`
- `/sitrep-int/<env>/webhooks/everbridge`
- `/sitrep-int/<env>/m365/qdrive` if required later

Populate the values directly in AWS Secrets Manager.

Do not place values in:

- source control
- markdown files
- shell history saved to shared logs
- chat transcripts

## Step 3. Attach least-privilege policies

- Attach per-function secrets access only to the exact secret path required.
- Attach DynamoDB table permissions only to the functions that use them.
- Attach SQS send permissions only to functions that emit failures to DLQs.
- Attach Lambda invoke permissions only where orchestration requires it.

## Step 4. Configure webhook shared secrets

### ArcGIS webhook receiver

- Generate a strong random shared secret.
- Store it in `/sitrep-int/<env>/webhooks/arcgis`.
- Configure the same secret on the ArcGIS webhook definition.

### Everbridge callback receiver

- If Everbridge supports a shared secret or signature configuration, create and store it in `/sitrep-int/<env>/webhooks/everbridge`.
- Configure the matching value in the Everbridge callback definition.

## Step 5. Validate credential access without exposing values

Validation should confirm capability, not reveal secrets.

### ArcGIS runtime validation

- Acquire token or authenticate via the configured mechanism.
- Read SITREP feature layer metadata.
- Read a small sample from the target layer.
- Write a controlled test row to a non-production related table if allowed.

### Everbridge polling validation

- Authenticate to the API.
- Retrieve one recent notification summary in non-production or sandbox.

### Everbridge draft validation

- Create a draft in test or sandbox.
- Confirm the returned notification ID and draft status.
- Confirm the role cannot launch if pilot restrictions are intended.

### AWS runtime validation

- Invoke each Lambda with a non-sensitive test event.
- Confirm it can read only its required secrets.
- Confirm denied access for secrets outside its intended scope.

## Step 6. Document ownership and rotation

- Record owner and rotation owner for each secret.
- Record last updated date.
- Record approval for production use.
- Record emergency revocation contact.

Store this administrative metadata in the organization’s approved configuration register, not in this workspace.

## Step 7. Run security acceptance checks

- Verify no personal accounts are embedded in automation.
- Verify no production credentials are reused in test.
- Verify runtime logs do not print secrets or tokens.
- Verify client-side code contains no embedded credentials.
- Verify webhook validation is enabled.

## Step 8. Handover to implementation team

Provide the team with:

- Secret names only, not raw values
- Role names and attached policy names
- ArcGIS item identifiers and endpoint URLs as approved
- Everbridge base URL and permitted API scope summary

## Minimum Go-Live Security Criteria

- All production secrets stored only in Secrets Manager
- Least-privilege roles applied to runtime functions
- Webhook validation enabled on all inbound endpoints
- Audit logging enabled
- Secret owners and rotation owners recorded
- Non-production validation completed successfully before production cutover