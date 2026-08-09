const test = require("node:test");
const assert = require("node:assert/strict");

const ENV_KEYS = [
  "ENVIRONMENT",
  "STATE_STORE_MODE",
  "ARC_GIS_RUNTIME_SECRET_ARN",
  "ARC_GIS_WEBHOOK_SHARED_SECRET",
  "EVERBRIDGE_WEBHOOK_SHARED_SECRET",
  "EVERBRIDGE_POLLING_SECRET_ARN",
  "EVERBRIDGE_DRAFT_SECRET_ARN",
  "CORRELATION_TABLE_NAME",
  "PROCESSING_LEDGER_TABLE_NAME",
  "FEED_DEDUP_TABLE_NAME"
];

function setTestEnv() {
  process.env.ENVIRONMENT = "test";
  process.env.STATE_STORE_MODE = "memory";
  process.env.ARC_GIS_RUNTIME_SECRET_ARN = "arn:test:arcgis";
  process.env.ARC_GIS_WEBHOOK_SHARED_SECRET = "top-secret";
  process.env.EVERBRIDGE_WEBHOOK_SHARED_SECRET = "everbridge-secret";
  process.env.EVERBRIDGE_POLLING_SECRET_ARN = "arn:test:polling";
  process.env.EVERBRIDGE_DRAFT_SECRET_ARN = "arn:test:draft";
  process.env.CORRELATION_TABLE_NAME = "correlation";
  process.env.PROCESSING_LEDGER_TABLE_NAME = "ledger";
  process.env.FEED_DEDUP_TABLE_NAME = "feed-dedup";
}

function clearTestEnv() {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
}

function clearModules(modulePaths) {
  modulePaths.forEach((modulePath) => {
    delete require.cache[require.resolve(modulePath)];
  });
}

test("arcgis webhook suppresses duplicate draft creation", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/handlers/arcgisWebhookHandler",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/arcgisWriter"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  const arcGisWriter = require("../src/handlers/arcgisWriter");
  let draftCalls = 0;
  let writeCalls = 0;

  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: "EB-1001",
      status: "draft"
    };
  };

  arcGisWriter.executeArcGisWrite = async () => {
    writeCalls += 1;
    return {
      written: true
    };
  };

  const { handler } = require("../src/handlers/arcgisWebhookHandler");
  const event = {
    headers: {
      "x-arcgis-webhook-secret": "top-secret"
    },
    body: JSON.stringify({
      eventType: "feature.updated",
      objectId: 42,
      eventId: "2026-HUR-04",
      district: "D7",
      reportType: "update",
      changedFields: ["event_status"],
      record: {
        event_name: "Hurricane Alpha",
        event_status: "active_response",
        report_effective_time: "2026-08-07T12:00:00Z",
        next_report_due: "2026-08-07T18:00:00Z",
        current_situation: "Escalating storm impact.",
        source_system: "ArcGIS"
      }
    })
  };

  const firstResponse = await handler(event);
  const secondResponse = await handler(event);
  const config = require("../src/lib/config").getConfig();

  const correlationRecord = await stateStore.getCorrelationRecord(
    config,
    "2026-HUR-04",
    "D7",
    "notification-state"
  );

  clearTestEnv();

  const firstParsed = JSON.parse(firstResponse.body);
  const secondParsed = JSON.parse(secondResponse.body);

  assert.equal(firstResponse.statusCode, 202);
  assert.equal(firstParsed.details.evaluation.shouldCreateDraft, true);
  assert.equal(secondResponse.statusCode, 202);
  assert.equal(secondParsed.details.evaluation.shouldCreateDraft, false);
  assert.equal(secondParsed.details.evaluation.suppressionReason, "Duplicate draft request suppressed by state store.");
  assert.equal(draftCalls, 1);
  assert.equal(writeCalls, 1);
  assert.equal(correlationRecord.everbridge_notification_id, "EB-1001");
  assert.equal(correlationRecord.last_notification_hash, firstParsed.details.evaluation.dedupeHash);
});

test("everbridge callback suppresses duplicate callback writes", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/everbridgeClient",
    "../src/handlers/arcgisWriter",
    "../src/handlers/everbridgeCallbackHandler"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const everbridgeClient = require("../src/lib/everbridgeClient");
  const arcGisWriter = require("../src/handlers/arcgisWriter");
  let detailCalls = 0;
  let writeCalls = 0;

  secrets.resolveJsonSecret = async () => ({ accountId: "acct-1", baseUrl: "https://example.test" });
  everbridgeClient.getNotificationDetail = async () => {
    detailCalls += 1;
    return {
      id: "EB-2002",
      externalReference: "2026-HUR-04:D7:accountability",
      title: "Callback Detail",
      launchTimeUtc: "2026-08-07T13:00:00Z",
      targetedCount: 10,
      deliveredCount: 8,
      confirmedSafe: 5,
      assistanceRequested: 1,
      noResponse: 2,
      status: "active"
    };
  };
  arcGisWriter.executeArcGisWrite = async () => {
    writeCalls += 1;
    return { written: true };
  };

  const { handler } = require("../src/handlers/everbridgeCallbackHandler");
  const event = {
    headers: {
      "x-everbridge-webhook-secret": "everbridge-secret"
    },
    body: JSON.stringify({
      notificationId: "EB-2002",
      status: "delivered"
    })
  };

  const firstResponse = await handler(event);
  const secondResponse = await handler(event);
  const config = require("../src/lib/config").getConfig();

  const correlationRecord = await stateStore.getCorrelationRecord(
    config,
    "2026-HUR-04",
    "D7",
    "notification-state"
  );

  clearTestEnv();

  const firstParsed = JSON.parse(firstResponse.body);
  const secondParsed = JSON.parse(secondResponse.body);

  assert.equal(firstResponse.statusCode, 202);
  assert.equal(firstParsed.details.arcGisPayload.event_id, "2026-HUR-04");
  assert.equal(firstParsed.details.metrics.writeCount, 1);
  assert.equal(firstParsed.details.metrics.callbackStatusCounts.delivered, 1);
  assert.equal(secondResponse.statusCode, 202);
  assert.equal(secondParsed.details.suppressed, true);
  assert.equal(secondParsed.details.reason, "Duplicate callback suppressed by state store.");
  assert.equal(secondParsed.details.metrics.suppressedCount, 1);
  assert.equal(secondParsed.details.metrics.suppressionReasonCounts["duplicate-callback"], 1);
  assert.equal(detailCalls, 1);
  assert.equal(writeCalls, 1);
  assert.equal(correlationRecord.everbridge_notification_id, "EB-2002");
  assert.equal(correlationRecord.source_system, "Everbridge");
});

test("everbridge callback maps upstream detail auth failures to unauthorized", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/everbridgeClient",
    "../src/handlers/arcgisWriter",
    "../src/handlers/everbridgeCallbackHandler"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const everbridgeClient = require("../src/lib/everbridgeClient");
  const arcGisWriter = require("../src/handlers/arcgisWriter");

  let writeCalls = 0;

  secrets.resolveJsonSecret = async () => ({ accountId: "acct-1", baseUrl: "https://example.test" });
  everbridgeClient.getNotificationDetail = async () => {
    const error = new Error("HTTP 401 returned from https://example.test");
    error.statusCode = 401;
    error.responseBody = {
      status: 401,
      message: "Invalid Notification"
    };

    throw error;
  };
  arcGisWriter.executeArcGisWrite = async () => {
    writeCalls += 1;
    return { written: true };
  };

  const { handler } = require("../src/handlers/everbridgeCallbackHandler");
  const response = await handler({
    headers: {
      "x-everbridge-webhook-secret": "everbridge-secret"
    },
    body: JSON.stringify({
      notificationId: "EB-401",
      status: "delivered"
    })
  });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 401);
  assert.equal(parsed.errorCode, "UNAUTHORIZED");
  assert.equal(parsed.message, "Everbridge callback is not authorized to read notification detail.");
  assert.equal(parsed.details.notificationId, "EB-401");
  assert.equal(parsed.details.upstreamStatus, 401);
  assert.equal(parsed.details.upstreamMessage, "Invalid Notification");
  assert.equal(writeCalls, 0);
});

test("everbridge callback maps arcgis write failures to bad gateway", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/everbridgeClient",
    "../src/handlers/arcgisWriter",
    "../src/handlers/everbridgeCallbackHandler"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const everbridgeClient = require("../src/lib/everbridgeClient");
  const arcGisWriter = require("../src/handlers/arcgisWriter");

  secrets.resolveJsonSecret = async () => ({ accountId: "acct-1", baseUrl: "https://example.test" });
  everbridgeClient.getNotificationDetail = async () => ({
    id: "EB-502",
    externalReference: "2026-HUR-04:D7:accountability",
    title: "Callback Detail",
    launchTimeUtc: "2026-08-07T13:00:00Z",
    targetedCount: 10,
    deliveredCount: 8,
    confirmedSafe: 5,
    assistanceRequested: 1,
    noResponse: 2,
    status: "active"
  });

  arcGisWriter.executeArcGisWrite = async () => {
    throw new Error("ArcGIS token request failed: Unable to generate token. (Invalid username or password.)");
  };

  const { handler } = require("../src/handlers/everbridgeCallbackHandler");
  const response = await handler({
    headers: {
      "x-everbridge-webhook-secret": "everbridge-secret"
    },
    body: JSON.stringify({
      notificationId: "EB-502",
      status: "delivered"
    })
  });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 502);
  assert.equal(parsed.errorCode, "BAD_GATEWAY");
  assert.equal(parsed.message, "Everbridge callback failed to write to ArcGIS.");
  assert.equal(parsed.details.notificationId, "EB-502");
  assert.equal(parsed.details.eventId, "2026-HUR-04");
  assert.equal(parsed.details.district, "D7");
  assert.match(parsed.details.upstreamMessage, /ArcGIS token request failed/);
});

test("everbridge poller suppresses duplicate polled notifications", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/everbridgeClient",
    "../src/handlers/arcgisWriter",
    "../src/handlers/everbridgePoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const everbridgeClient = require("../src/lib/everbridgeClient");
  const arcGisWriter = require("../src/handlers/arcgisWriter");
  let listCalls = 0;
  let detailCalls = 0;
  let writeCalls = 0;

  secrets.resolveJsonSecret = async () => ({ accountId: "acct-1", baseUrl: "https://example.test" });
  everbridgeClient.listNotifications = async () => {
    listCalls += 1;
    return [
      {
        notificationId: "EB-3003",
        status: "active",
        lastUpdated: "2026-08-07T14:00:00Z"
      }
    ];
  };
  everbridgeClient.getNotificationDetail = async () => {
    detailCalls += 1;
    return {
      id: "EB-3003",
      externalReference: "2026-HUR-04:D7:accountability",
      title: "Polled Notification",
      launchTimeUtc: "2026-08-07T14:00:00Z",
      targetedCount: 20,
      deliveredCount: 18,
      confirmedSafe: 15,
      assistanceRequested: 2,
      noResponse: 1,
      status: "active"
    };
  };
  arcGisWriter.executeArcGisWrite = async () => {
    writeCalls += 1;
    return { written: true };
  };

  const { handler } = require("../src/handlers/everbridgePoller");

  const firstResponse = await handler({ mode: "active", windowMinutes: 5 });
  const secondResponse = await handler({ mode: "active", windowMinutes: 5 });
  const config = require("../src/lib/config").getConfig();

  const correlationRecord = await stateStore.getCorrelationRecord(
    config,
    "2026-HUR-04",
    "D7",
    "notification-state"
  );

  clearTestEnv();

  const firstParsed = JSON.parse(firstResponse.body);
  const secondParsed = JSON.parse(secondResponse.body);

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(firstParsed.notifications[0].notificationId, "EB-3003");
  assert.equal(firstParsed.metrics.writeCount, 1);
  assert.equal(firstParsed.metrics.notificationStatusCounts.active, 1);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondParsed.notifications[0].skipped, true);
  assert.equal(secondParsed.notifications[0].reason, "duplicate-poll-notification");
  assert.equal(secondParsed.metrics.skippedCount, 1);
  assert.equal(secondParsed.metrics.suppressionReasonCounts["duplicate-poll-notification"], 1);
  assert.equal(listCalls, 2);
  assert.equal(detailCalls, 1);
  assert.equal(writeCalls, 1);
  assert.equal(correlationRecord.everbridge_notification_id, "EB-3003");
  assert.equal(correlationRecord.notification_status, "active");
});

test("everbridge poller counts missing event correlation suppressions", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/everbridgeClient",
    "../src/handlers/arcgisWriter",
    "../src/handlers/everbridgePoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const everbridgeClient = require("../src/lib/everbridgeClient");
  const arcGisWriter = require("../src/handlers/arcgisWriter");
  let writeCalls = 0;

  secrets.resolveJsonSecret = async () => ({ accountId: "acct-1", baseUrl: "https://example.test" });
  everbridgeClient.listNotifications = async () => [
    {
      notificationId: "EB-3004",
      status: "active",
      lastUpdated: "2026-08-07T15:00:00Z"
    }
  ];
  everbridgeClient.getNotificationDetail = async () => ({
    id: "EB-3004",
    externalReference: "invalid-reference",
    title: "Unmapped Notification",
    launchTimeUtc: "2026-08-07T15:00:00Z",
    targetedCount: 5,
    deliveredCount: 5,
    confirmedSafe: 4,
    assistanceRequested: 0,
    noResponse: 1,
    status: "active"
  });
  arcGisWriter.executeArcGisWrite = async () => {
    writeCalls += 1;
    return { written: true };
  };

  const { handler } = require("../src/handlers/everbridgePoller");
  const response = await handler({ mode: "active", windowMinutes: 5 });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.notifications[0].notificationId, "EB-3004");
  assert.equal(parsed.notifications[0].skipped, true);
  assert.equal(parsed.notifications[0].reason, "missing-event-correlation");
  assert.equal(parsed.metrics.skippedCount, 1);
  assert.equal(parsed.metrics.suppressionReasonCounts["missing-event-correlation"], 1);
  assert.equal(writeCalls, 0);
});