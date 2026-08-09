# Secrets Manager and IAM Standard

## Purpose

This document defines how secrets and execution permissions should be structured for the SITREP integration.

## Secrets Naming Standard

Use the pattern:

`/<application>/<environment>/<platform>/<purpose>`

Recommended application name:

- `sitrep-int`

Recommended environment names:

- `dev`
- `test`
- `prod`

## Recommended Secrets

| Secret name | Purpose |
| --- | --- |
| `/sitrep-int/dev/arcgis/runtime` | ArcGIS runtime API credentials for SITREP reads and writes |
| `/sitrep-int/dev/arcgis/admin` | ArcGIS admin credentials for webhook and schema management |
| `/sitrep-int/dev/everbridge/polling` | Everbridge polling credentials |
| `/sitrep-int/dev/everbridge/draft` | Everbridge draft-creation credentials |
| `/sitrep-int/dev/webhooks/arcgis` | Shared secret or validation settings for ArcGIS webhook receiver |
| `/sitrep-int/dev/webhooks/everbridge` | Shared secret or signature-verification settings for Everbridge callback receiver |
| `/sitrep-int/dev/m365/qdrive` | Optional Microsoft 365 or Q-Drive integration credentials |

Repeat the same path structure for `test` and `prod`.

## Suggested Secret Payloads

### ArcGIS runtime

```json
{
  "baseUrl": "https://example.maps.arcgis.com",
  "tokenUrl": "https://example.maps.arcgis.com/sharing/rest/generateToken",
  "clientId": "replace-me-if-using-oauth",
  "clientSecret": "replace-me",
  "accessToken": "replace-me-if-preprovisioned",
  "username": "replace-me-if-using-service-account",
  "password": "replace-me-if-using-service-account",
  "referer": "https://example.maps.arcgis.com",
  "featureLayerUrl": "https://services.arcgis.com/.../FeatureServer/0",
  "relatedTableUrl": "https://services.arcgis.com/.../FeatureServer/1",
  "hazardDistrictLookup": {
    "layerUrl": "https://services.arcgis.com/.../FeatureServer/2",
    "districtField": "district_code",
    "eventIdField": "current_event_id",
    "eventNameField": "current_event_name",
    "where": "active = 1",
    "inSR": 4326
  },
  "hazardFeeds": [
    {
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
  ]
}
```

Notes:

- The runtime supports either a preprovisioned `accessToken` or username and password token generation.
- If `tokenUrl` is omitted, the runtime derives it from `baseUrl`.
- `hazardDistrictLookup` is optional and allows `hazardFeedPoller` to query an ArcGIS district layer by hazard geometry center when feed-local district mapping is absent.
- The application environment may override the persisted spatial lookup memo TTL with `STATE_STORE_SPATIAL_LOOKUP_TTL_SECONDS`.
- `hazardFeeds` is optional and is consumed by `hazardFeedPoller` for pilot feed automation.
- Each configured feed may provide default `eventId`, `district`, and `eventName` values when the upstream feed does not provide them directly.
- `districtAreas` is optional and allows the poller to derive district and event correlation from a feature geometry, bbox, or point using configured bounding boxes or polygons.
- Hazard correlation provenance is written into poll responses and hazard correlation records so operators can audit whether the match came from feed fields, configured geometry, or ArcGIS lookup.

### ArcGIS admin

```json
{
  "baseUrl": "https://example.maps.arcgis.com",
  "clientId": "replace-me-if-using-oauth",
  "clientSecret": "replace-me",
  "username": "replace-me-if-using-service-account",
  "password": "replace-me-if-using-service-account",
  "surveyItemId": "replace-me",
  "featureServiceItemId": "replace-me"
}
```

### Everbridge polling

```json
{
  "baseUrl": "https://api.everbridge.net",
  "clientId": "replace-me",
  "clientSecret": "replace-me",
  "accountId": "replace-me",
  "defaultWindowMinutes": 5
}
```

### Everbridge draft

```json
{
  "baseUrl": "https://api.everbridge.net",
  "clientId": "replace-me",
  "clientSecret": "replace-me",
  "accessToken": "replace-me-if-preprovisioned",
  "accountId": "replace-me",
  "draftEndpointUrl": "https://api.everbridge.net/rest/notifications/<accountId>/drafts",
  "defaultSender": "replace-me",
  "manualApprovalOnly": true
}
```

Notes:

- The runtime supports either a preprovisioned `accessToken` or basic authentication via `clientId` and `clientSecret`.
- If `draftEndpointUrl` is omitted, the runtime derives it from `baseUrl` and `accountId`.

### Webhook validation secret

```json
{
  "headerName": "X-ArcGIS-Webhook-Secret",
  "sharedSecret": "replace-me",
  "algorithm": "plain-compare-or-hmac-if-supported"
}
```

## IAM Role Standard

Recommended runtime roles:

- `sitrep-int-dev-arcgis-webhook-role`
- `sitrep-int-dev-everbridge-callback-role`
- `sitrep-int-dev-rules-evaluator-role`
- `sitrep-int-dev-everbridge-poller-role`
- `sitrep-int-dev-hazard-feed-poller-role`
- `sitrep-int-dev-arcgis-writer-role`
- `sitrep-int-dev-everbridge-draft-role`

Repeat with `test` and `prod` prefixes.

## Permission Boundaries

- Each role should access only its required secret paths.
- Each role should access only its required DynamoDB tables and queue ARNs.
- Draft-creation role should not have permission to modify unrelated AWS resources.
- Infrastructure deployment permissions should not be attached to runtime roles.

## Sample IAM Policy Skeletons

### 1. Secrets read policy for ArcGIS writer

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadArcGISRuntimeSecret",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:/sitrep-int/ENV/arcgis/runtime*"
      ]
    }
  ]
}
```

### 2. DynamoDB write policy for processing state

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WriteCorrelationState",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/sitrep-int-correlation",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/sitrep-int-processing-ledger",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/sitrep-int-feed-dedup"
      ]
    }
  ]
}
```

### 3. SQS dead-letter queue write policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WriteToDlq",
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage"
      ],
      "Resource": [
        "arn:aws:sqs:REGION:ACCOUNT_ID:sitrep-int-arcgis-dlq",
        "arn:aws:sqs:REGION:ACCOUNT_ID:sitrep-int-everbridge-dlq",
        "arn:aws:sqs:REGION:ACCOUNT_ID:sitrep-int-rules-dlq"
      ]
    }
  ]
}
```

### 4. CloudWatch logs policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WriteLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### 5. Lambda invoke policy for orchestration

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeRulesEvaluator",
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": [
        "arn:aws:lambda:REGION:ACCOUNT_ID:function:sitrep-int-ENV-rules-evaluator"
      ]
    }
  ]
}
```

## Deny Considerations

- Do not grant runtime roles `secretsmanager:ListSecrets` unless operationally necessary.
- Do not grant runtime roles wildcard `iam:*`, `cloudformation:*`, or `apigateway:*` privileges.
- Do not allow the draft-creation role to access production secrets from non-production environments.

## Tagging Standard

Apply these tags to secrets and roles:

- `Application = sitrep-int`
- `Environment = dev|test|prod`
- `Owner = integration-team`
- `DataClass = confidential`

## Validation Checklist

- Secret path matches environment and platform.
- Secret payload includes only required keys.
- Role policy does not grant broad administrative actions.
- Cross-environment access is blocked.