const crypto = require("crypto");

function hasChanged(changedFields, fieldName) {
  return Array.isArray(changedFields) && changedFields.includes(fieldName);
}

function isPastDue(value, now) {
  if (!value) {
    return false;
  }

  const due = new Date(value);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

function buildDedupeHash(normalizedEvent, triggerId) {
  const materialPayload = {
    eventId: normalizedEvent.eventId,
    district: normalizedEvent.district,
    triggerId,
    record: normalizedEvent.record
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(materialPayload))
    .digest("hex")
    .slice(0, 16);
}

function requiredFieldsSatisfied(normalizedEvent, requiredFields) {
  return requiredFields.every((fieldName) => {
    if (fieldName in normalizedEvent) {
      return Boolean(normalizedEvent[fieldName]);
    }

    if (fieldName in normalizedEvent.record) {
      const value = normalizedEvent.record[fieldName];
      return value !== "" && value !== null && value !== undefined;
    }

    return false;
  });
}

function buildTriggers(normalizedEvent, now) {
  const triggers = [];
  const record = normalizedEvent.record;
  const changedFields = normalizedEvent.changedFields;

  if (record.members_not_accounted_for > 0) {
    triggers.push({
      triggerId: "TRG-02",
      messageType: "accountability_followup",
      reason: "Members not accounted for is greater than zero.",
      requiredFields: ["district", "eventName", "current_situation"],
      approvalStatus: "pending-review"
    });
  }

  if (record.requested_priority === "urgent" && record.request_status === "open") {
    triggers.push({
      triggerId: "TRG-04",
      messageType: "urgent_resource_request",
      reason: "An urgent open resource request is present.",
      requiredFields: ["district", "eventName", "requested_capability", "requested_quantity", "needed_by", "current_situation"],
      approvalStatus: "pending-review"
    });
  }

  if (record.leadership_attention_required === "yes") {
    triggers.push({
      triggerId: "TRG-05",
      messageType: "leadership_decision_request",
      reason: "Leadership attention is required.",
      requiredFields: ["district", "eventName", "leadership_attention_summary", "current_situation"],
      approvalStatus: "pending-review"
    });
  }

  if (record.event_status === "active_response" && (hasChanged(changedFields, "event_status") || normalizedEvent.triggerType === "feature_created")) {
    triggers.push({
      triggerId: "TRG-01",
      messageType: "district_status_update",
      reason: "Event status entered active response.",
      requiredFields: ["district", "eventName", "reportType", "report_effective_time", "current_situation", "next_report_due"],
      approvalStatus: "pending-review"
    });
  }

  if (record.members_requesting_assistance > 0 && hasChanged(changedFields, "members_requesting_assistance")) {
    triggers.push({
      triggerId: "TRG-03",
      messageType: "assistance_escalation",
      reason: "Members requesting assistance increased on this update.",
      requiredFields: ["district", "eventName", "members_requesting_assistance", "open_assistance_cases", "current_situation"],
      approvalStatus: "pending-review"
    });
  }

  if (isPastDue(record.next_report_due, now)) {
    triggers.push({
      triggerId: "TRG-06",
      messageType: "reporting_reminder",
      reason: "The next report due time has passed.",
      requiredFields: ["district", "eventName", "next_report_due", "report_effective_time", "event_status"],
      approvalStatus: "pending-review"
    });
  }

  return triggers;
}

function evaluateNormalizedEvent(normalizedEvent, now = new Date()) {
  if (!normalizedEvent.eventId || !normalizedEvent.district) {
    return {
      isValid: false,
      message: "Rules evaluation requires eventId and district."
    };
  }

  if (normalizedEvent.record.source_system === "everbridgesync") {
    return {
      isValid: true,
      shouldCreateDraft: false,
      suppressionReason: "Suppressed integration-originated event.",
      matchedTriggers: [],
      updates: {
        integration_processed: true,
        notification_eligible: false,
        approval_status: "suppressed",
        trigger_type: "suppressed_source_system"
      }
    };
  }

  if (normalizedEvent.record.event_status === "closed") {
    return {
      isValid: true,
      shouldCreateDraft: false,
      suppressionReason: "Suppressed closed event.",
      matchedTriggers: [],
      updates: {
        integration_processed: true,
        notification_eligible: false,
        approval_status: "suppressed",
        trigger_type: "suppressed_closed_event"
      }
    };
  }

  const matchedTriggers = buildTriggers(normalizedEvent, now);
  if (matchedTriggers.length === 0) {
    return {
      isValid: true,
      shouldCreateDraft: false,
      suppressionReason: "No configured trigger matched this event.",
      matchedTriggers: [],
      updates: {
        integration_processed: true,
        notification_eligible: false,
        approval_status: "no-action",
        trigger_type: normalizedEvent.triggerType || "sitrep_update"
      }
    };
  }

  const primaryTrigger = matchedTriggers[0];
  if (!requiredFieldsSatisfied(normalizedEvent, primaryTrigger.requiredFields)) {
    return {
      isValid: true,
      shouldCreateDraft: false,
      suppressionReason: `Missing required variables for ${primaryTrigger.triggerId}.`,
      matchedTriggers,
      updates: {
        integration_processed: true,
        notification_eligible: false,
        approval_status: "missing-required-fields",
        trigger_type: primaryTrigger.triggerId
      }
    };
  }

  return {
    isValid: true,
    shouldCreateDraft: true,
    messageType: primaryTrigger.messageType,
    triggerId: primaryTrigger.triggerId,
    reason: primaryTrigger.reason,
    dedupeHash: buildDedupeHash(normalizedEvent, primaryTrigger.triggerId),
    matchedTriggers,
    updates: {
      integration_processed: true,
      notification_eligible: true,
      approval_status: primaryTrigger.approvalStatus,
      trigger_type: primaryTrigger.triggerId
    }
  };
}

module.exports = {
  evaluateNormalizedEvent
};
