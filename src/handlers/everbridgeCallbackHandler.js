const { getConfig } = require("../lib/config");
const logger = require("../lib/logger");
const { acceptedWithDetails, badGateway, badRequest, serverError, unauthorized } = require("../lib/response");
const { getHeader, parseJsonBody } = require("../lib/eventParser");
const { resolveWebhookSharedSecret, resolveJsonSecret } = require("../lib/secrets");
const { hasConfiguredSecret, secretsMatch } = require("../lib/security");
const { getNotificationDetail } = require("../lib/everbridgeClient");
const { buildArcGisWritePayload } = require("../lib/everbridgeMapping");
const {
  buildEverbridgeCallbackDedupKey,
  claimDeduplicationKey,
  putCorrelationRecord,
  putLedgerEntry,
} = require("../lib/stateStore");
const { executeArcGisWrite } = require("./arcgisWriter");

function buildCallbackMetrics(payload, options) {
  return {
    totalCallbacks: 1,
    suppressedCount: options && options.suppressed ? 1 : 0,
    writeCount: options && options.written ? 1 : 0,
    callbackStatusCounts: {
      [payload.status || "unknown"]: 1
    },
    suppressionReasonCounts: options && options.reason ? { [options.reason]: 1 } : {}
  };
}

exports.handler = async function everbridgeCallbackHandler(event) {
  const config = getConfig();
  const payload = parseJsonBody(event);

  if (!payload) {
    return badRequest("Everbridge callback body is missing or invalid JSON.");
  }

  const receivedSecret = getHeader(event, config.everbridgeWebhookHeaderName);
  if (!receivedSecret) {
    return badRequest("Everbridge callback secret header is missing.");
  }

  const expectedSecret = await resolveWebhookSharedSecret({
    configuredSharedSecret: config.everbridgeWebhookSharedSecret,
    secretArn: config.everbridgeWebhookSecretArn,
    environment: config.environment,
    secretType: "everbridge"
  });

  if (!hasConfiguredSecret(expectedSecret)) {
    logger.error("Everbridge callback shared secret is not configured.", {
      environment: config.environment,
      missing: config.missing,
      secretArnConfigured: Boolean(config.everbridgeWebhookSecretArn)
    });

    return serverError("Everbridge callback validation secret is not configured.");
  }

  if (!secretsMatch(expectedSecret, receivedSecret)) {
    return unauthorized("Everbridge callback secret validation failed.");
  }

  if (!payload.notificationId) {
    return badRequest("Everbridge callback requires notificationId.");
  }

  const correlationId = `everbridge-${payload.notificationId || "unknown"}`;
  const callbackDedupKey = buildEverbridgeCallbackDedupKey(payload);

  await putLedgerEntry(config, correlationId, {
    source_system: "Everbridge",
    notification_id: payload.notificationId,
    status: "received",
    trigger_type: payload.status || "callback"
  });

  const dedupClaim = await claimDeduplicationKey(config, callbackDedupKey, {
    correlationId,
    notificationId: payload.notificationId,
    status: payload.status || null
  });

  if (!dedupClaim.claimed) {
    const metrics = buildCallbackMetrics(payload, {
      suppressed: true,
      reason: "duplicate-callback"
    });

    await putLedgerEntry(config, correlationId, {
      source_system: "Everbridge",
      notification_id: payload.notificationId,
      status: "suppressed-duplicate-callback",
      dedupe_key: callbackDedupKey,
      dedupe_recorded_at_utc: dedupClaim.record ? dedupClaim.record.recorded_at_utc : null,
      metrics
    });

    logger.metric("EverbridgeCallbackSummary", {
      dimensions: {
        environment: config.environment,
        status: payload.status || "unknown"
      },
      values: metrics,
      context: {
        correlationId,
        notificationId: payload.notificationId,
        suppressed: true,
        suppressionReason: "duplicate-callback"
      }
    });

    logger.metric("EverbridgeCallbackDuplicateSuppression", {
      dimensions: {
        environment: config.environment,
        status: payload.status || "unknown"
      },
      values: {
        count: 1
      },
      context: {
        correlationId,
        notificationId: payload.notificationId
      }
    });

    return acceptedWithDetails(correlationId, "refresh-notification-detail", {
      suppressed: true,
      reason: "Duplicate callback suppressed by state store.",
      metrics
    });
  }

  const everbridgeConfig = await resolveJsonSecret(config.everbridgePollingSecretArn);
  if (!everbridgeConfig) {
    return serverError("Everbridge polling secret is not configured.");
  }

  let detail;

  try {
    detail = await getNotificationDetail(everbridgeConfig, payload.notificationId);
  } catch (error) {
    const upstreamStatus = Number.parseInt(error && error.statusCode, 10);
    const details = {
      notificationId: payload.notificationId,
      upstreamStatus: Number.isFinite(upstreamStatus) ? upstreamStatus : null,
      upstreamMessage: (error && error.responseBody && error.responseBody.message) || error.message || "Unknown Everbridge error."
    };

    logger.warn("Everbridge callback detail lookup failed.", {
      environment: config.environment,
      correlationId,
      ...details
    });

    if (upstreamStatus === 400 || upstreamStatus === 404) {
      return badRequest("Everbridge callback notification could not be resolved.", details);
    }

    if (upstreamStatus === 401 || upstreamStatus === 403) {
      return unauthorized("Everbridge callback is not authorized to read notification detail.", details);
    }

    return badGateway("Everbridge callback failed to retrieve notification detail from upstream API.", details);
  }

  const arcGisPayload = buildArcGisWritePayload(detail, {
    notificationId: payload.notificationId,
    notificationStatus: payload.status,
    externalReference: payload.externalReference || payload.external_reference
  });

  if (!arcGisPayload.event_id || !arcGisPayload.district) {
    return badRequest("Everbridge callback could not resolve event_id and district from notification detail.");
  }

  let writeResult;

  try {
    writeResult = await executeArcGisWrite(arcGisPayload);
  } catch (error) {
    const details = {
      notificationId: payload.notificationId,
      eventId: arcGisPayload.event_id,
      district: arcGisPayload.district,
      upstreamMessage: error && error.message ? error.message : "Unknown ArcGIS write error."
    };

    logger.warn("Everbridge callback ArcGIS write failed.", {
      environment: config.environment,
      correlationId,
      ...details
    });

    return badGateway("Everbridge callback failed to write to ArcGIS.", details);
  }

  if (writeResult && writeResult.statusCode) {
    return writeResult;
  }

  const metrics = buildCallbackMetrics(payload, {
    written: true
  });

  await putLedgerEntry(config, correlationId, {
    source_system: "Everbridge",
    event_id: arcGisPayload.event_id,
    district: arcGisPayload.district,
    notification_id: payload.notificationId,
    status: "completed",
    dedupe_key: callbackDedupKey,
    dedupe_recorded_at_utc: dedupClaim.record ? dedupClaim.record.recorded_at_utc : null,
    metrics
  });

  await putCorrelationRecord(config, arcGisPayload.event_id, arcGisPayload.district, {
    record_type: "notification-state",
    source_system: "Everbridge",
    everbridge_notification_id: payload.notificationId,
    notification_type: arcGisPayload.notification_type,
    notification_status: arcGisPayload.notification_status,
    approval_status: "synced",
    last_notification_hash: null,
    integration_processed: true,
    last_processed_at: new Date().toISOString(),
    last_sync_utc: arcGisPayload.last_sync_utc
  });

  logger.info("Received Everbridge callback.", {
    correlationId,
    environment: config.environment,
    notificationId: payload.notificationId,
    status: payload.status,
    eventId: arcGisPayload.event_id,
    district: arcGisPayload.district,
    metrics
  });

  logger.metric("EverbridgeCallbackSummary", {
    dimensions: {
      environment: config.environment,
      status: payload.status || "unknown"
    },
    values: metrics,
    context: {
      correlationId,
      notificationId: payload.notificationId,
      eventId: arcGisPayload.event_id,
      district: arcGisPayload.district
    }
  });

  return acceptedWithDetails(correlationId, "refresh-notification-detail", {
    detail,
    arcGisPayload,
    writeResult,
    metrics
  });
};
