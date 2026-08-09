const { getConfig } = require("../lib/config");
const logger = require("../lib/logger");
const { acceptedWithDetails, badRequest, serverError, unauthorized } = require("../lib/response");
const { getHeader, parseJsonBody } = require("../lib/eventParser");
const { normalizeEvent } = require("../lib/arcgisNormalization");
const { evaluateNormalizedEvent } = require("../lib/ruleEngine");
const { hasConfiguredSecret, secretsMatch } = require("../lib/security");
const { resolveWebhookSharedSecret } = require("../lib/secrets");
const { buildDraftRequest } = require("../lib/draftMapping");
const { buildArcGisIntegrationUpdate } = require("../lib/arcgisMapping");
const {
  buildDraftDedupKey,
  claimDeduplicationKey,
  putCorrelationRecord,
  putLedgerEntry,
} = require("../lib/stateStore");
const { executeDraftCreation } = require("./everbridgeDraftCreator");
const { executeArcGisWrite } = require("./arcgisWriter");

function buildCorrelationId(payload) {
  const objectId = payload && payload.objectId ? String(payload.objectId) : "unknown";
  return `arcgis-${objectId}-${Date.now()}`;
}

exports.handler = async function arcgisWebhookHandler(event) {
  const config = getConfig();
  const payload = parseJsonBody(event);

  if (!payload) {
    return badRequest("ArcGIS webhook body is missing or invalid JSON.");
  }

  const receivedSecret = getHeader(event, config.arcGisWebhookHeaderName);
  if (!receivedSecret) {
    return badRequest("ArcGIS webhook secret header is missing.");
  }

  const expectedSecret = await resolveWebhookSharedSecret({
    configuredSharedSecret: config.arcGisWebhookSharedSecret,
    secretArn: config.arcGisWebhookSecretArn,
    environment: config.environment,
    secretType: "arcgis"
  });

  if (!hasConfiguredSecret(expectedSecret)) {
    logger.error("ArcGIS webhook shared secret is not configured.", {
      environment: config.environment,
      missing: config.missing,
      secretArnConfigured: Boolean(config.arcGisWebhookSecretArn)
    });

    return serverError("ArcGIS webhook validation secret is not configured.");
  }

  if (!secretsMatch(expectedSecret, receivedSecret)) {
    return unauthorized("ArcGIS webhook secret validation failed.");
  }

  const normalizedEvent = normalizeEvent(payload);
  if (!normalizedEvent.eventId || !normalizedEvent.district) {
    return badRequest("ArcGIS webhook payload requires eventId and district.", {
      eventId: normalizedEvent.eventId,
      district: normalizedEvent.district
    });
  }

  const correlationId = buildCorrelationId(payload);
  const evaluation = evaluateNormalizedEvent(normalizedEvent);
  let draftResult = null;
  let arcGisWriteResult = null;

  await putLedgerEntry(config, correlationId, {
    source_system: "ArcGIS",
    event_id: normalizedEvent.eventId,
    district: normalizedEvent.district,
    status: "received",
    trigger_type: evaluation.triggerId || evaluation.updates.trigger_type || normalizedEvent.triggerType
  });

  if (evaluation.shouldCreateDraft) {
    const draftDedupKey = buildDraftDedupKey(normalizedEvent, evaluation);
    const dedupClaim = await claimDeduplicationKey(config, draftDedupKey, {
      correlationId,
      eventId: normalizedEvent.eventId,
      district: normalizedEvent.district,
      triggerId: evaluation.triggerId
    });

    if (!dedupClaim.claimed) {
      await putLedgerEntry(config, correlationId, {
        source_system: "ArcGIS",
        event_id: normalizedEvent.eventId,
        district: normalizedEvent.district,
        status: "suppressed-duplicate-draft",
        trigger_type: evaluation.triggerId,
        dedupe_key: draftDedupKey,
        dedupe_recorded_at_utc: dedupClaim.record ? dedupClaim.record.recorded_at_utc : null
      });

      return acceptedWithDetails(correlationId, "evaluate-rules", {
        normalizedEvent,
        evaluation: {
          ...evaluation,
          shouldCreateDraft: false,
          suppressionReason: "Duplicate draft request suppressed by state store."
        },
        draftResult: null,
        arcGisWriteResult: null
      });
    }

    const draftRequest = buildDraftRequest(normalizedEvent, evaluation);
    draftResult = await executeDraftCreation(draftRequest);

    if (draftResult && draftResult.statusCode) {
      return draftResult;
    }

    const arcGisUpdate = buildArcGisIntegrationUpdate(normalizedEvent, evaluation, draftResult);
    arcGisWriteResult = await executeArcGisWrite(arcGisUpdate);

    if (arcGisWriteResult && arcGisWriteResult.statusCode) {
      return arcGisWriteResult;
    }

    await putLedgerEntry(config, correlationId, {
      source_system: "ArcGIS",
      event_id: normalizedEvent.eventId,
      district: normalizedEvent.district,
      status: "completed",
      trigger_type: evaluation.triggerId,
      dedupe_key: draftDedupKey,
      dedupe_recorded_at_utc: dedupClaim.record ? dedupClaim.record.recorded_at_utc : null,
      notification_id: draftResult.notificationId
    });

    await putCorrelationRecord(config, normalizedEvent.eventId, normalizedEvent.district, {
      record_type: "notification-state",
      source_system: "ArcGIS",
      everbridge_notification_id: draftResult.notificationId,
      notification_type: evaluation.messageType,
      notification_status: draftResult.status,
      approval_status: draftResult.approvalStatus,
      last_notification_hash: evaluation.dedupeHash,
      integration_processed: true,
      object_id: normalizedEvent.objectId,
      global_id: normalizedEvent.globalId || null,
      last_processed_at: new Date().toISOString()
    });
  } else {
    await putLedgerEntry(config, correlationId, {
      source_system: "ArcGIS",
      event_id: normalizedEvent.eventId,
      district: normalizedEvent.district,
      status: "no-action",
      trigger_type: evaluation.updates.trigger_type || normalizedEvent.triggerType,
      reason: evaluation.suppressionReason || evaluation.reason || "none"
    });
  }

  logger.info("Received ArcGIS webhook.", {
    correlationId,
    environment: config.environment,
    objectId: normalizedEvent.objectId,
    changedFields: normalizedEvent.changedFields,
    triggerPreview: evaluation.triggerId || null,
    shouldCreateDraft: evaluation.shouldCreateDraft || false,
    notificationId: draftResult ? draftResult.notificationId : null
  });

  return acceptedWithDetails(correlationId, "evaluate-rules", {
    normalizedEvent,
    evaluation,
    draftResult,
    arcGisWriteResult
  });
};
