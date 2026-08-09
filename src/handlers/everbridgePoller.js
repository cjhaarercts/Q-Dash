const { getConfig } = require("../lib/config");
const logger = require("../lib/logger");
const { json, serverError } = require("../lib/response");
const { resolveJsonSecret } = require("../lib/secrets");
const { getNotificationDetail, listNotifications } = require("../lib/everbridgeClient");
const { buildArcGisWritePayload } = require("../lib/everbridgeMapping");
const {
  buildEverbridgePollDedupKey,
  claimDeduplicationKey,
  putCorrelationRecord,
  putLedgerEntry,
} = require("../lib/stateStore");
const { executeArcGisWrite } = require("./arcgisWriter");

function incrementCounter(target, key) {
  if (!key) {
    return;
  }

  target[key] = (target[key] || 0) + 1;
}

function buildPollMetrics(notifications) {
  const metrics = {
    totalNotifications: notifications.length,
    writeCount: 0,
    skippedCount: 0,
    notificationStatusCounts: {},
    suppressionReasonCounts: {}
  };

  for (const notification of notifications) {
    if (notification.notificationStatus) {
      incrementCounter(metrics.notificationStatusCounts, notification.notificationStatus);
    }

    if (notification.skipped) {
      metrics.skippedCount += 1;
      incrementCounter(metrics.suppressionReasonCounts, notification.reason || "unknown");
      continue;
    }

    metrics.writeCount += 1;
  }

  return metrics;
}

exports.handler = async function everbridgePoller(event) {
  const config = getConfig();
  const mode = event && event.mode ? event.mode : "active";
  const windowMinutes = event && event.windowMinutes ? event.windowMinutes : 5;
  const pollCorrelationId = `everbridge-poll-${mode}-${Date.now()}`;

  await putLedgerEntry(config, pollCorrelationId, {
    source_system: "Everbridge",
    status: "received",
    trigger_type: mode,
    window_minutes: windowMinutes
  });

  const everbridgeConfig = await resolveJsonSecret(config.everbridgePollingSecretArn);
  if (!everbridgeConfig) {
    return serverError("Everbridge polling secret is not configured.");
  }

  const notifications = await listNotifications(everbridgeConfig, {
    mode,
    windowMinutes
  });

  const processed = [];

  for (const notification of notifications) {
    const notificationId = notification.notificationId || notification.notification_id || notification.id;
    if (!notificationId) {
      continue;
    }

    const pollDedupKey = buildEverbridgePollDedupKey(notification);
    const dedupClaim = await claimDeduplicationKey(config, pollDedupKey, {
      pollCorrelationId,
      notificationId,
      status: notification.status || null
    });

    if (!dedupClaim.claimed) {
      processed.push({
        notificationId,
        notificationStatus: notification.status || null,
        skipped: true,
        reason: "duplicate-poll-notification",
        dedupeRecordedAtUtc: dedupClaim.record ? dedupClaim.record.recorded_at_utc : null
      });
      continue;
    }

    const detail = await getNotificationDetail(everbridgeConfig, notificationId);
    const arcGisPayload = buildArcGisWritePayload(detail, {
      notificationId,
      notificationStatus: notification.status,
      externalReference: notification.externalReference || notification.external_reference
    });

    if (!arcGisPayload.event_id || !arcGisPayload.district) {
      processed.push({
        notificationId,
        notificationStatus: notification.status || null,
        skipped: true,
        reason: "missing-event-correlation"
      });
      continue;
    }

    const writeResult = await executeArcGisWrite(arcGisPayload);

    if (writeResult && writeResult.statusCode) {
      return writeResult;
    }

    processed.push({
      notificationId,
      notificationStatus: notification.status || null,
      eventId: arcGisPayload.event_id,
      district: arcGisPayload.district,
      dedupeRecordedAtUtc: dedupClaim.record ? dedupClaim.record.recorded_at_utc : null,
      writeResult
    });

    await putCorrelationRecord(config, arcGisPayload.event_id, arcGisPayload.district, {
      record_type: "notification-state",
      source_system: "Everbridge",
      everbridge_notification_id: notificationId,
      notification_type: arcGisPayload.notification_type,
      notification_status: arcGisPayload.notification_status,
      approval_status: "synced",
      last_notification_hash: null,
      integration_processed: true,
      last_processed_at: new Date().toISOString(),
      last_sync_utc: arcGisPayload.last_sync_utc
    });
  }

  const metrics = buildPollMetrics(processed);

  await putLedgerEntry(config, pollCorrelationId, {
    source_system: "Everbridge",
    status: "completed",
    trigger_type: mode,
    processed_count: processed.length,
    metrics
  });

  logger.info("Polling Everbridge notifications.", {
    environment: config.environment,
    mode,
    windowMinutes,
    processedCount: processed.length,
    metrics
  });

  logger.metric("EverbridgePollSummary", {
    dimensions: {
      environment: config.environment,
      mode
    },
    values: metrics,
    context: {
      correlationId: pollCorrelationId,
      windowMinutes,
      processedCount: processed.length
    }
  });

  if (metrics.suppressionReasonCounts["duplicate-poll-notification"]) {
    logger.metric("EverbridgePollDuplicateSuppression", {
      dimensions: {
        environment: config.environment,
        mode
      },
      values: {
        count: metrics.suppressionReasonCounts["duplicate-poll-notification"]
      },
      context: {
        correlationId: pollCorrelationId,
        windowMinutes
      }
    });
  }

  if (metrics.suppressionReasonCounts["missing-event-correlation"]) {
    logger.metric("EverbridgePollMissingEventCorrelation", {
      dimensions: {
        environment: config.environment,
        mode
      },
      values: {
        count: metrics.suppressionReasonCounts["missing-event-correlation"]
      },
      context: {
        correlationId: pollCorrelationId,
        windowMinutes
      }
    });
  }

  return json(200, {
    processed: true,
    mode,
    windowMinutes,
    metrics,
    notifications: processed
  });
};
