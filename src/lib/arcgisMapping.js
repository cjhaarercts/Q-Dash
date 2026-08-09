function buildArcGisIntegrationUpdate(normalizedEvent, evaluation, draftResult) {
  const record = normalizedEvent.record;

  return {
    event_id: normalizedEvent.eventId,
    district: normalizedEvent.district,
    object_id: normalizedEvent.objectId,
    global_id: normalizedEvent.globalId,
    event_district_key: `${normalizedEvent.eventId}:${normalizedEvent.district}`,
    eb_notification_id: draftResult && draftResult.notificationId ? draftResult.notificationId : null,
    notification_type: evaluation.messageType || null,
    notification_title: normalizedEvent.eventName || null,
    launch_time_utc: null,
    targeted_count: 0,
    delivered_count: 0,
    failed_count: 0,
    confirmed_safe: 0,
    assistance_requested: record.members_requesting_assistance,
    no_response: record.members_not_accounted_for,
    notification_status: draftResult ? draftResult.status : null,
    last_sync_utc: new Date().toISOString(),
    source_system: "ArcGISWorkflow",
    sitrep_updates: {
      source_system: "ArcGISWorkflow",
      trigger_type: evaluation.triggerId || evaluation.updates.trigger_type,
      integration_processed: evaluation.updates.integration_processed,
      notification_eligible: evaluation.updates.notification_eligible,
      approval_status: draftResult ? draftResult.approvalStatus : evaluation.updates.approval_status,
      last_notification_hash: evaluation.dedupeHash || null,
      last_everbridge_sync_utc: new Date().toISOString()
    }
  };
}

module.exports = {
  buildArcGisIntegrationUpdate
};