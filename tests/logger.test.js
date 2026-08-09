const test = require("node:test");
const assert = require("node:assert/strict");

test("logger.metric emits flattened metric values with dimensions", () => {
  delete require.cache[require.resolve("../src/lib/logger")];
  const logger = require("../src/lib/logger");
  const originalConsoleLog = console.log;
  const entries = [];

  console.log = (message) => {
    entries.push(JSON.parse(message));
  };

  try {
    logger.metric("HazardFeedPollSummary", {
      dimensions: {
        environment: "test",
        feedName: "nhc"
      },
      values: {
        totalUpdates: 2,
        actionCounts: {
          "draft-created": 1
        },
        suppressionReasonCounts: {
          "duplicate-hazard-update": 1
        }
      },
      context: {
        correlationId: "hazard-nhc-1"
      }
    });
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, "info");
  assert.equal(entries[0].eventType, "metric");
  assert.equal(entries[0].metricName, "HazardFeedPollSummary");
  assert.equal(entries[0].dimensions.environment, "test");
  assert.equal(entries[0].dimensions.feedName, "nhc");
  assert.equal(entries[0].values.totalUpdates, 2);
  assert.equal(entries[0].values["actionCounts.draft-created"], 1);
  assert.equal(entries[0].values["suppressionReasonCounts.duplicate-hazard-update"], 1);
  assert.equal(entries[0].context.correlationId, "hazard-nhc-1");
});