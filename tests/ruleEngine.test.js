const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateNormalizedEvent } = require("../src/lib/ruleEngine");

function buildBaseEvent(overrides) {
  return {
    eventId: "2026-HUR-04",
    eventName: "Hurricane Alpha",
    district: "D7",
    reportType: "update",
    triggerType: "feature_updated",
    changedFields: [],
    record: {
      event_status: "monitoring_preimpact",
      report_effective_time: "2026-08-07T14:00:00Z",
      next_report_due: "2026-08-07T18:00:00Z",
      current_situation: "Monitoring only.",
      members_not_accounted_for: 0,
      members_requesting_assistance: 0,
      open_assistance_cases: 0,
      requested_capability: "",
      requested_quantity: 0,
      requested_priority: "",
      needed_by: "",
      request_status: "",
      leadership_attention_required: "no",
      leadership_attention_summary: "",
      source_system: "arcgis"
    },
    ...overrides,
    record: {
      event_status: "monitoring_preimpact",
      report_effective_time: "2026-08-07T14:00:00Z",
      next_report_due: "2026-08-07T18:00:00Z",
      current_situation: "Monitoring only.",
      members_not_accounted_for: 0,
      members_requesting_assistance: 0,
      open_assistance_cases: 0,
      requested_capability: "",
      requested_quantity: 0,
      requested_priority: "",
      needed_by: "",
      request_status: "",
      leadership_attention_required: "no",
      leadership_attention_summary: "",
      source_system: "arcgis",
      ...(overrides && overrides.record ? overrides.record : {})
    }
  };
}

test("rule engine suppresses integration-originated events", () => {
  const result = evaluateNormalizedEvent(
    buildBaseEvent({
      record: {
        source_system: "everbridgesync"
      }
    })
  );

  assert.equal(result.shouldCreateDraft, false);
  assert.equal(result.updates.approval_status, "suppressed");
});

test("rule engine selects accountability follow-up when members are unaccounted for", () => {
  const result = evaluateNormalizedEvent(
    buildBaseEvent({
      changedFields: ["members_not_accounted_for"],
      record: {
        current_situation: "Accountability not complete.",
        members_not_accounted_for: 4
      }
    })
  );

  assert.equal(result.shouldCreateDraft, true);
  assert.equal(result.triggerId, "TRG-02");
  assert.equal(result.messageType, "accountability_followup");
  assert.match(result.dedupeHash, /^[a-f0-9]{16}$/);
});

test("rule engine selects overdue reporting reminder when next report due has passed", () => {
  const result = evaluateNormalizedEvent(
    buildBaseEvent({
      record: {
        event_status: "active_response",
        next_report_due: "2026-08-07T10:00:00Z"
      }
    }),
    new Date("2026-08-07T12:00:00Z")
  );

  assert.equal(result.shouldCreateDraft, true);
  assert.equal(result.triggerId, "TRG-06");
  assert.equal(result.messageType, "reporting_reminder");
});
