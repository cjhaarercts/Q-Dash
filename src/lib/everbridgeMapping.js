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

function parseExternalReference(externalReference) {
  if (typeof externalReference !== "string" || externalReference.trim() === "") {
    return {
      eventId: "",
      district: "",
      notificationType: ""
    };
  }

  const [eventId = "", district = "", notificationType = ""] = externalReference.split(":");

  return {
    eventId: eventId.trim(),
    district: district.trim(),
    notificationType: notificationType.trim()
  };
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function buildArcGisWritePayload(detail, defaults) {
  const reference = parseExternalReference(
    pickFirst(detail.externalReference, detail.external_reference, defaults.externalReference)
  );

  const eventId = pickFirst(detail.eventId, detail.event_id, defaults.eventId, reference.eventId);
  const district = pickFirst(detail.district, defaults.district, reference.district);
  const notificationType = pickFirst(
    detail.notificationType,
    detail.notification_type,
    defaults.notificationType,
    reference.notificationType
  );

  return {
    event_id: eventId,
    district,
    event_district_key: eventId && district ? `${eventId}:${district}` : null,
    eb_notification_id: pickFirst(detail.notificationId, detail.notification_id, detail.id, defaults.notificationId),
    notification_type: notificationType,
    notification_title: pickFirst(detail.notificationTitle, detail.notification_title, detail.title, defaults.notificationTitle),
    launch_time_utc: pickFirst(detail.launchTimeUtc, detail.launch_time_utc, detail.launchTime, detail.launch_time),
    targeted_count: asInteger(pickFirst(detail.targetedCount, detail.targeted_count, detail.targeted)),
    delivered_count: asInteger(pickFirst(detail.deliveredCount, detail.delivered_count, detail.delivered)),
    failed_count: asInteger(pickFirst(detail.failedCount, detail.failed_count, detail.failed)),
    confirmed_safe: asInteger(pickFirst(detail.confirmedSafe, detail.confirmed_safe)),
    assistance_requested: asInteger(pickFirst(detail.assistanceRequested, detail.assistance_requested)),
    no_response: asInteger(pickFirst(detail.noResponse, detail.no_response)),
    notification_status: pickFirst(detail.status, detail.notification_status, defaults.notificationStatus),
    last_sync_utc: new Date().toISOString(),
    source_system: "EverbridgeSync"
  };
}

module.exports = {
  buildArcGisWritePayload,
  parseExternalReference
};
