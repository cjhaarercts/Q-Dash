const test = require("node:test");
const assert = require("node:assert/strict");

const { buildArcGisWritePayload, parseExternalReference } = require("../src/lib/everbridgeMapping");

test("parseExternalReference extracts event id district and type", () => {
  const parsed = parseExternalReference("2026-HUR-04:D7:accountability");

  assert.deepEqual(parsed, {
    eventId: "2026-HUR-04",
    district: "D7",
    notificationType: "accountability"
  });
});

test("buildArcGisWritePayload maps Everbridge detail into ArcGIS write payload", () => {
  const payload = buildArcGisWritePayload(
    {
      id: "EB-123",
      externalReference: "2026-HUR-04:D7:accountability",
      title: "Hurricane Alpha Accountability",
      launchTimeUtc: "2026-08-07T12:00:00Z",
      targetedCount: "2400",
      deliveredCount: 2300,
      failedCount: 20,
      confirmedSafe: "1900",
      assistanceRequested: 12,
      noResponse: 388,
      status: "active"
    },
    {}
  );

  assert.equal(payload.event_id, "2026-HUR-04");
  assert.equal(payload.district, "D7");
  assert.equal(payload.notification_type, "accountability");
  assert.equal(payload.eb_notification_id, "EB-123");
  assert.equal(payload.targeted_count, 2400);
  assert.equal(payload.confirmed_safe, 1900);
  assert.equal(payload.source_system, "EverbridgeSync");
});