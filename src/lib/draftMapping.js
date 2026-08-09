const TEMPLATE_BY_MESSAGE_TYPE = {
  district_status_update: "tmpl-district-status-update",
  accountability_followup: "tmpl-accountability-followup",
  assistance_escalation: "tmpl-assistance-escalation",
  urgent_resource_request: "tmpl-urgent-resource-request",
  leadership_decision_request: "tmpl-leadership-decision-request",
  reporting_reminder: "tmpl-reporting-reminder"
};

function humanizeToken(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildTemplateVariables(normalizedEvent) {
  const record = normalizedEvent.record;

  return {
    district: normalizedEvent.district,
    event_name: normalizedEvent.eventName,
    event_id: normalizedEvent.eventId,
    event_status: humanizeToken(record.event_status),
    report_type: humanizeToken(normalizedEvent.reportType),
    report_effective_time: record.report_effective_time,
    next_report_due: record.next_report_due,
    current_situation: record.current_situation,
    members_not_accounted_for: record.members_not_accounted_for,
    members_requesting_assistance: record.members_requesting_assistance,
    open_assistance_cases: record.open_assistance_cases,
    requested_capability: record.requested_capability,
    requested_quantity: record.requested_quantity,
    requested_priority: humanizeToken(record.requested_priority),
    needed_by: record.needed_by,
    leadership_attention_summary: record.leadership_attention_summary
  };
}

function buildDraftRequest(normalizedEvent, evaluation) {
  return {
    eventId: normalizedEvent.eventId,
    district: normalizedEvent.district,
    messageType: evaluation.messageType,
    approvalMode: "manual",
    templateId: TEMPLATE_BY_MESSAGE_TYPE[evaluation.messageType] || "tmpl-generic-manual-review",
    templateVariables: buildTemplateVariables(normalizedEvent),
    dedupeHash: evaluation.dedupeHash
  };
}

module.exports = {
  buildDraftRequest
};
