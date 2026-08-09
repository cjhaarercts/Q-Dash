function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function asInteger(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeToken(value) {
  return asString(value).toLowerCase().replace(/[\.\s/-]+/g, "_");
}

function normalizeEvent(payload) {
  const record = payload && typeof payload.record === "object" ? payload.record : {};
  const sourceSystem = asString(payload.sourceSystem || payload.source_system || record.source_system || "ArcGIS");
  const changedFields = asArray(payload.changedFields).map((field) => asString(field));
  const eventStatus = normalizeToken(record.event_status || payload.eventStatus || payload.event_status);
  const requestStatus = normalizeToken(record.request_status || payload.requestStatus || payload.request_status);
  const requestedPriority = normalizeToken(record.requested_priority || payload.requestedPriority || payload.requested_priority);
  const leadershipAttentionRequired = normalizeToken(
    record.leadership_attention_required || payload.leadershipAttentionRequired || payload.leadership_attention_required
  );

  return {
    sourceSystem,
    eventType: asString(payload.eventType || payload.event_type || "feature.updated"),
    receivedAtUtc: asString(payload.receivedAtUtc || payload.received_at_utc || new Date().toISOString()),
    layerName: asString(payload.layerName || payload.layer_name || "DistrictSITREP"),
    objectId: payload.objectId || payload.object_id || record.objectid || null,
    globalId: asString(payload.globalId || payload.global_id || record.globalid),
    eventId: asString(payload.eventId || payload.event_id || record.event_id),
    eventName: asString(record.event_name || payload.eventName || payload.event_name),
    district: asString(payload.district || record.district),
    reportType: normalizeToken(payload.reportType || payload.report_type || record.report_type),
    changedFields,
    triggerType: normalizeToken(payload.triggerType || payload.trigger_type || payload.eventType || "sitrep_update"),
    record: {
      event_status: eventStatus,
      report_effective_time: asString(record.report_effective_time || payload.report_effective_time),
      next_report_due: asString(record.next_report_due || payload.next_report_due),
      current_situation: asString(record.current_situation || payload.current_situation),
      members_not_accounted_for: asInteger(record.members_not_accounted_for || payload.members_not_accounted_for),
      members_requesting_assistance: asInteger(record.members_requesting_assistance || payload.members_requesting_assistance),
      open_assistance_cases: asInteger(record.open_assistance_cases || payload.open_assistance_cases),
      requested_capability: asString(record.requested_capability || payload.requested_capability),
      requested_quantity: asInteger(record.requested_quantity || payload.requested_quantity),
      requested_priority: requestedPriority,
      needed_by: asString(record.needed_by || payload.needed_by),
      request_status: requestStatus,
      leadership_attention_required: leadershipAttentionRequired,
      leadership_attention_summary: asString(record.leadership_attention_summary || payload.leadership_attention_summary),
      source_system: normalizeToken(sourceSystem)
    }
  };
}

module.exports = {
  normalizeEvent
};
