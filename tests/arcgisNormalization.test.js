const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeEvent } = require("../src/lib/arcgisNormalization");

test("normalizeEvent maps mixed ArcGIS payload fields into the internal shape", () => {
  const normalized = normalizeEvent({
    sourceSystem: "ArcGIS",
    eventType: "feature.created",
    objectId: 42,
    globalId: "{abc}",
    eventId: "2026-HUR-04",
    district: "D7",
    reportType: "Significant Change",
    changedFields: ["event_status", "members_requesting_assistance"],
    record: {
      event_name: "Hurricane Alpha",
      event_status: "Active Response",
      current_situation: "Storm conditions worsening.",
      members_requesting_assistance: "2",
      members_not_accounted_for: "1",
      open_assistance_cases: "3",
      requested_priority: "Urgent",
      request_status: "Open",
      leadership_attention_required: "Yes"
    }
  });

  assert.equal(normalized.triggerType, "feature_created");
  assert.equal(normalized.reportType, "significant_change");
  assert.equal(normalized.eventName, "Hurricane Alpha");
  assert.equal(normalized.record.event_status, "active_response");
  assert.equal(normalized.record.members_requesting_assistance, 2);
  assert.equal(normalized.record.members_not_accounted_for, 1);
  assert.equal(normalized.record.requested_priority, "urgent");
  assert.equal(normalized.record.request_status, "open");
  assert.equal(normalized.record.leadership_attention_required, "yes");
});
