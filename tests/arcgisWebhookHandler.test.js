const test = require("node:test");
const assert = require("node:assert/strict");

const { handler } = require("../src/handlers/arcgisWebhookHandler");

const ENV_KEYS = [
  "ENVIRONMENT",
  "ARC_GIS_RUNTIME_SECRET_ARN",
  "ARC_GIS_WEBHOOK_SHARED_SECRET",
  "EVERBRIDGE_POLLING_SECRET_ARN",
  "EVERBRIDGE_DRAFT_SECRET_ARN",
  "CORRELATION_TABLE_NAME",
  "PROCESSING_LEDGER_TABLE_NAME"
];

function setTestEnv() {
  process.env.ENVIRONMENT = "test";
  process.env.ARC_GIS_RUNTIME_SECRET_ARN = "arn:test:arcgis";
  process.env.ARC_GIS_WEBHOOK_SHARED_SECRET = "top-secret";
  process.env.EVERBRIDGE_POLLING_SECRET_ARN = "arn:test:polling";
  process.env.EVERBRIDGE_DRAFT_SECRET_ARN = "arn:test:draft";
  process.env.CORRELATION_TABLE_NAME = "correlation";
  process.env.PROCESSING_LEDGER_TABLE_NAME = "ledger";
}

function clearTestEnv() {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
}

test("arcgis webhook rejects an invalid secret", async () => {
  setTestEnv();

  const response = await handler({
    headers: {
      "x-arcgis-webhook-secret": "wrong-secret"
    },
    body: JSON.stringify({
      eventId: "2026-HUR-04",
      district: "D7",
      record: {}
    })
  });

  clearTestEnv();
  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 401);
  assert.equal(parsed.errorCode, "UNAUTHORIZED");
});

test("arcgis webhook returns accepted with no-action details when no trigger matches", async () => {
  setTestEnv();

  const response = await handler({
    headers: {
      "x-arcgis-webhook-secret": "top-secret"
    },
    body: JSON.stringify({
      eventType: "feature.updated",
      objectId: 42,
      eventId: "2026-HUR-04",
      district: "D7",
      reportType: "update",
      changedFields: [],
      record: {
        event_name: "Hurricane Alpha",
        event_status: "Monitoring/Pre-Impact",
        current_situation: "Monitoring only.",
        source_system: "ArcGIS"
      }
    })
  });

  clearTestEnv();
  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 202);
  assert.equal(parsed.accepted, true);
  assert.equal(parsed.details.evaluation.shouldCreateDraft, false);
  assert.equal(parsed.details.evaluation.updates.approval_status, "no-action");
});