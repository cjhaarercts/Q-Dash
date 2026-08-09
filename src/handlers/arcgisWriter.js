const { getConfig } = require("../lib/config");
const logger = require("../lib/logger");
const { badRequest, json, serverError } = require("../lib/response");
const { parseJsonBody } = require("../lib/eventParser");
const { resolveJsonSecret } = require("../lib/secrets");
const { addFeature, getToken, updateFeature } = require("../lib/arcgisClient");

function buildRelatedTableAttributes(payload) {
  return {
    event_id: payload.event_id,
    district: payload.district,
    event_district_key: payload.event_district_key,
    eb_notification_id: payload.eb_notification_id,
    notification_type: payload.notification_type,
    notification_title: payload.notification_title,
    launch_time_utc: payload.launch_time_utc,
    targeted_count: payload.targeted_count,
    delivered_count: payload.delivered_count,
    failed_count: payload.failed_count,
    confirmed_safe: payload.confirmed_safe,
    assistance_requested: payload.assistance_requested,
    no_response: payload.no_response,
    notification_status: payload.notification_status,
    last_sync_utc: payload.last_sync_utc,
    source_system: payload.source_system
  };
}

function buildSitrepUpdateAttributes(payload) {
  if (!payload.sitrep_updates || !payload.object_id) {
    return null;
  }

  return {
    objectid: payload.object_id,
    source_system: payload.sitrep_updates.source_system,
    trigger_type: payload.sitrep_updates.trigger_type,
    integration_processed: payload.sitrep_updates.integration_processed,
    notification_eligible: payload.sitrep_updates.notification_eligible,
    approval_status: payload.sitrep_updates.approval_status,
    last_notification_hash: payload.sitrep_updates.last_notification_hash,
    last_everbridge_sync_utc: payload.sitrep_updates.last_everbridge_sync_utc
  };
}

async function executeArcGisWrite(event) {
  const config = getConfig();
  const payload = parseJsonBody(event) || event;

  if (!payload || !payload.event_id || !payload.district) {
    return badRequest("ArcGIS writer requires event_id and district.");
  }

  const arcGisRuntime = await resolveJsonSecret(config.arcGisRuntimeSecretArn);
  const targetFeatureLayerUrl = arcGisRuntime && arcGisRuntime.featureLayerUrl ? arcGisRuntime.featureLayerUrl : null;
  const targetRelatedTableUrl = arcGisRuntime && arcGisRuntime.relatedTableUrl ? arcGisRuntime.relatedTableUrl : null;

  if (!arcGisRuntime || !targetRelatedTableUrl) {
    return serverError("ArcGIS runtime secret is missing related table configuration.");
  }

  const token = await getToken(arcGisRuntime);
  const relatedTableResult = await addFeature(targetRelatedTableUrl, token, buildRelatedTableAttributes(payload));
  const sitrepUpdateAttributes = buildSitrepUpdateAttributes(payload);
  const sitrepUpdateResult = sitrepUpdateAttributes && targetFeatureLayerUrl
    ? await updateFeature(targetFeatureLayerUrl, token, sitrepUpdateAttributes)
    : null;

  logger.info("Applied ArcGIS integration update.", {
    environment: config.environment,
    eventId: payload.event_id,
    district: payload.district,
    notificationId: payload.eb_notification_id || null,
    targetFeatureLayerUrl,
    targetRelatedTableUrl,
    updatedSitrepRecord: Boolean(sitrepUpdateAttributes)
  });

  return {
    written: true,
    target: "Everbridge_Notification_Log",
    eventId: payload.event_id,
    district: payload.district,
    targetFeatureLayerUrl,
    targetRelatedTableUrl,
    relatedTableResult,
    sitrepUpdateResult
  };
}

exports.executeArcGisWrite = executeArcGisWrite;

exports.handler = async function arcgisWriter(event) {
  const result = await executeArcGisWrite(event);

  if (result && result.statusCode) {
    return result;
  }

  return json(200, result);
};
