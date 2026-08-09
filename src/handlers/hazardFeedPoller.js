const { getConfig } = require("../lib/config");
const logger = require("../lib/logger");
const { json, serverError } = require("../lib/response");
const { resolveJsonSecret } = require("../lib/secrets");
const { requestJson } = require("../lib/http");
const { getBoundsCenter, getFeatureBounds, resolveDistrictIntersection } = require("../lib/geospatial");
const { getToken, queryFeatures } = require("../lib/arcgisClient");
const {
  claimDeduplicationKey,
  getSpatialLookupMemo,
  putCorrelationRecord,
  putLedgerEntry,
  putSpatialLookupMemo
} = require("../lib/stateStore");
const { executeDraftCreation } = require("./everbridgeDraftCreator");

const SEVERITY_RANK = {
  unknown: 0,
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4
};

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");
}

function getProperty(source, ...keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return source[key];
    }
  }

  return null;
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return [];
}

function isExpired(value, now) {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= now.getTime();
}

function isActiveStatus(status) {
  const normalized = normalizeToken(status);
  return normalized === "active" || normalized === "open" || normalized === "new" || normalized === "warning";
}

function getSeverityRank(value) {
  return SEVERITY_RANK[normalizeToken(value)] || 0;
}

function getFeedSources(event, arcGisRuntime) {
  if (Array.isArray(event && event.feeds) && event.feeds.length > 0) {
    return event.feeds;
  }

  if (Array.isArray(arcGisRuntime && arcGisRuntime.hazardFeeds) && arcGisRuntime.hazardFeeds.length > 0) {
    return arcGisRuntime.hazardFeeds;
  }

  return [];
}

function extractFeedFeatures(feed, responseBody) {
  if (Array.isArray(feed.features)) {
    return feed.features;
  }

  if (Array.isArray(responseBody)) {
    return responseBody;
  }

  if (Array.isArray(responseBody && responseBody.features)) {
    return responseBody.features;
  }

  if (Array.isArray(responseBody && responseBody.results)) {
    return responseBody.results;
  }

  return [];
}

function buildDistrictLookupConfig(arcGisRuntime, feed) {
  const runtimeLookup = arcGisRuntime && arcGisRuntime.hazardDistrictLookup ? arcGisRuntime.hazardDistrictLookup : null;
  const feedLookup = feed && feed.districtLookup ? feed.districtLookup : null;
  const lookup = feedLookup || runtimeLookup;

  if (!lookup || !lookup.layerUrl) {
    return null;
  }

  return {
    layerUrl: lookup.layerUrl,
    districtField: lookup.districtField || "district",
    eventIdField: lookup.eventIdField || "event_id",
    eventNameField: lookup.eventNameField || "event_name",
    where: lookup.where || "1=1",
    inSR: lookup.inSR || 4326
  };
}

function buildDistrictLookupCacheKey(lookup, featureCenter) {
  if (!lookup || !featureCenter) {
    return null;
  }

  return [
    lookup.layerUrl,
    lookup.where,
    lookup.inSR,
    featureCenter.x.toFixed(3),
    featureCenter.y.toFixed(3)
  ].join(":");
}

async function resolveDistrictLookupMatch(arcGisRuntime, feed, featureBounds, districtLookupCache) {
  const config = getConfig();
  const lookup = buildDistrictLookupConfig(arcGisRuntime, feed);
  const featureCenter = getBoundsCenter(featureBounds);

  if (!lookup || !featureCenter) {
    return null;
  }

  const cacheKey = buildDistrictLookupCacheKey(lookup, featureCenter);
  if (cacheKey && districtLookupCache.has(cacheKey)) {
    const cachedValue = districtLookupCache.get(cacheKey);
    return cachedValue
      ? {
          ...cachedValue,
          correlationSource: "arcgis_district_lookup_run_cache"
        }
      : null;
  }

  const persistedMemoKey = cacheKey ? `spatial-lookup:${cacheKey}` : null;
  if (persistedMemoKey) {
    const persistedMemo = await getSpatialLookupMemo(config, persistedMemoKey);
    if (persistedMemo) {
      const memoValue = persistedMemo.value || null;
      districtLookupCache.set(cacheKey, memoValue);
      return memoValue
        ? {
            ...memoValue,
            correlationSource: "arcgis_district_lookup_persisted_cache"
          }
        : null;
    }
  }

  const token = await getToken(arcGisRuntime);
  const response = await queryFeatures(lookup.layerUrl, token, {
    where: lookup.where,
    geometry: {
      x: featureCenter.x,
      y: featureCenter.y,
      spatialReference: { wkid: lookup.inSR }
    },
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    inSR: lookup.inSR,
    outFields: [lookup.districtField, lookup.eventIdField, lookup.eventNameField],
    resultRecordCount: 1,
    returnGeometry: false
  });

  const firstFeature = response && Array.isArray(response.features) ? response.features[0] : null;
  const attributes = firstFeature && firstFeature.attributes ? firstFeature.attributes : null;
  if (!attributes) {
    if (cacheKey) {
      districtLookupCache.set(cacheKey, null);
    }

    if (persistedMemoKey) {
      await putSpatialLookupMemo(config, persistedMemoKey, null, {
        layerUrl: lookup.layerUrl,
        where: lookup.where,
        inSR: lookup.inSR,
        featureCenter
      });
    }

    return null;
  }

  const match = {
    district: String(attributes[lookup.districtField] || ""),
    eventId: String(attributes[lookup.eventIdField] || ""),
    eventName: String(attributes[lookup.eventNameField] || ""),
    areaName: "ArcGIS District Lookup",
    correlationSource: "arcgis_district_lookup_live"
  };

  if (cacheKey) {
    districtLookupCache.set(cacheKey, match);
  }

  if (persistedMemoKey) {
    await putSpatialLookupMemo(config, persistedMemoKey, match, {
      layerUrl: lookup.layerUrl,
      where: lookup.where,
      inSR: lookup.inSR,
      featureCenter
    });
  }

  return match;
}

async function normalizeFeature(arcGisRuntime, feed, feature, districtLookupCache) {
  const properties = feature && typeof feature === "object"
    ? (feature.attributes || feature.properties || feature)
    : {};
  const rawEventId = getProperty(properties, "eventId", "event_id");
  const rawDistrict = getProperty(properties, "district", "districtCode");
  const rawEventName = getProperty(properties, "eventName", "event_name");
  const featureBounds = getFeatureBounds(feature) || getFeatureBounds(properties);
  let districtMatch = resolveDistrictIntersection(feed.districtAreas, featureBounds);

  if (!districtMatch) {
    districtMatch = await resolveDistrictLookupMatch(arcGisRuntime, feed, featureBounds, districtLookupCache);
  }

  const featureId = getProperty(feature, "id", "objectid", "objectId")
    || getProperty(properties, "id", "feature_id", "featureId", "objectid", "objectId", "globalid", "globalId");
  const severity = normalizeToken(getProperty(properties, "severity", "severityLevel", "alertLevel", "alert_level") || "unknown");
  const status = normalizeToken(getProperty(properties, "status", "state") || "active");
  const updatedAt = getProperty(properties, "updatedAt", "updated_at", "lastUpdated", "effectiveTime", "sent") || new Date().toISOString();
  const expiresAt = getProperty(properties, "expiresAt", "expires_at", "endTime", "expiration", "expires");
  const correlationSource = rawEventId && rawDistrict
    ? "feed_feature"
    : districtMatch && districtMatch.correlationSource
      ? districtMatch.correlationSource
      : feed.eventId && feed.district
        ? "feed_defaults"
        : "unresolved";

  return {
    feedName: feed.name || "hazard-feed",
    featureId: String(featureId || "unknown"),
    hazardName: String(getProperty(properties, "title", "name", "headline", "event") || feed.name || "Hazard alert"),
    summary: String(getProperty(properties, "summary", "description", "message", "instruction") || ""),
    severity,
    status,
    correlationSource,
    featureBounds,
    updatedAt: String(updatedAt),
    expiresAt: expiresAt ? String(expiresAt) : null,
    eventId: String(rawEventId || (districtMatch && districtMatch.eventId) || feed.eventId || ""),
    district: String(rawDistrict || (districtMatch && districtMatch.district) || feed.district || ""),
    eventName: String(
      rawEventName
      || (districtMatch && districtMatch.eventName)
      || feed.eventName
      || getProperty(properties, "title", "name")
      || ""
    ),
    matchedAreaName: districtMatch ? districtMatch.areaName : null,
    properties
  };
}

function qualifiesFeature(feed, normalizedFeature, now) {
  if (!isActiveStatus(normalizedFeature.status)) {
    return {
      allowed: false,
      reason: "inactive-status"
    };
  }

  if (isExpired(normalizedFeature.expiresAt, now)) {
    return {
      allowed: false,
      reason: "expired-hazard"
    };
  }

  const minSeverity = feed.minSeverity || "moderate";
  if (getSeverityRank(normalizedFeature.severity) < getSeverityRank(minSeverity)) {
    return {
      allowed: false,
      reason: "below-severity-threshold"
    };
  }

  if (Array.isArray(feed.districtAreas) && feed.districtAreas.length > 0 && !normalizedFeature.district) {
    return {
      allowed: false,
      reason: normalizedFeature.featureBounds ? "outside-district-area" : "missing-feature-geometry"
    };
  }

  if (!normalizedFeature.eventId || !normalizedFeature.district) {
    return {
      allowed: false,
      reason: "missing-event-correlation"
    };
  }

  return {
    allowed: true,
    reason: null
  };
}

function buildHazardDedupKey(normalizedFeature) {
  return [
    "hazard-feed",
    normalizedFeature.feedName,
    normalizedFeature.featureId,
    normalizedFeature.updatedAt,
    normalizedFeature.severity,
    normalizedFeature.status
  ].join(":");
}

function buildDraftRequest(normalizedFeature, dedupeKey) {
  return {
    eventId: normalizedFeature.eventId,
    district: normalizedFeature.district,
    messageType: "hazard_monitoring_notice",
    approvalMode: "manual",
    templateId: "tmpl-hazard-monitoring-notice",
    templateVariables: {
      district: normalizedFeature.district,
      event_name: normalizedFeature.eventName || normalizedFeature.hazardName,
      event_id: normalizedFeature.eventId,
      current_situation: normalizedFeature.summary,
      hazard_name: normalizedFeature.hazardName,
      hazard_severity: normalizedFeature.severity,
      hazard_status: normalizedFeature.status,
      feed_name: normalizedFeature.feedName,
      expires_at_utc: normalizedFeature.expiresAt || ""
    },
    dedupeHash: dedupeKey
  };
}

async function fetchFeedPayload(feed) {
  if (!feed.url) {
    return null;
  }

  return requestJson(feed.url, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(feed.headers || {})
    }
  });
}

function incrementCounter(target, key) {
  if (!key) {
    return;
  }

  target[key] = (target[key] || 0) + 1;
}

function buildHazardMetrics(updates) {
  const metrics = {
    totalUpdates: updates.length,
    actionCounts: {},
    correlationSourceCounts: {},
    suppressionReasonCounts: {}
  };

  for (const update of updates) {
    if (update.action) {
      incrementCounter(metrics.actionCounts, update.action);
    }

    if (update.correlationSource) {
      incrementCounter(metrics.correlationSourceCounts, update.correlationSource);
    }

    if (update.skipped && update.reason) {
      incrementCounter(metrics.suppressionReasonCounts, update.reason);
    }
  }

  return metrics;
}

exports.handler = async function hazardFeedPoller(event) {
  const config = getConfig();
  const feedName = event && event.feedName ? event.feedName : "unspecified";
  const correlationId = `hazard-feed-${feedName}-${Date.now()}`;

  await putLedgerEntry(config, correlationId, {
    source_system: "HazardFeed",
    status: "received",
    trigger_type: feedName
  });

  const arcGisRuntime = await resolveJsonSecret(config.arcGisRuntimeSecretArn);
  const feeds = getFeedSources(event || {}, arcGisRuntime);

  if (feeds.length === 0) {
    return serverError("Hazard feed poller is not configured with any feeds.");
  }

  const updates = [];
  const drafts = [];
  const now = new Date();
  const districtLookupCache = new Map();

  for (const feed of feeds) {
    const responseBody = await fetchFeedPayload(feed);
    const features = extractFeedFeatures(feed, responseBody);

    for (const feature of features) {
      const normalizedFeature = await normalizeFeature(arcGisRuntime, feed, feature, districtLookupCache);
      const qualification = qualifiesFeature(feed, normalizedFeature, now);

      if (!qualification.allowed) {
        updates.push({
          feedName: normalizedFeature.feedName,
          featureId: normalizedFeature.featureId,
          skipped: true,
          reason: qualification.reason
        });
        continue;
      }

      const dedupeKey = buildHazardDedupKey(normalizedFeature);
      const dedupClaim = await claimDeduplicationKey(config, dedupeKey, {
        correlationId,
        feedName: normalizedFeature.feedName,
        featureId: normalizedFeature.featureId,
        eventId: normalizedFeature.eventId,
        district: normalizedFeature.district
      });

      if (!dedupClaim.claimed) {
        updates.push({
          feedName: normalizedFeature.feedName,
          featureId: normalizedFeature.featureId,
          skipped: true,
          reason: "duplicate-hazard-update"
        });
        continue;
      }

      const draftResult = await executeDraftCreation(buildDraftRequest(normalizedFeature, dedupeKey));
      if (draftResult && draftResult.statusCode) {
        return draftResult;
      }

      drafts.push({
        featureId: normalizedFeature.featureId,
        notificationId: draftResult.notificationId,
        district: normalizedFeature.district,
        eventId: normalizedFeature.eventId
      });

      await putCorrelationRecord(config, normalizedFeature.eventId, normalizedFeature.district, {
        record_type: `hazard-feed-state#${normalizedFeature.feedName}#${normalizedFeature.featureId}`,
        source_system: "HazardFeed",
        correlation_source: normalizedFeature.correlationSource,
        feed_name: normalizedFeature.feedName,
        source_record_id: normalizedFeature.featureId,
        everbridge_notification_id: draftResult.notificationId,
        notification_type: "hazard_monitoring_notice",
        notification_status: draftResult.status,
        approval_status: draftResult.approvalStatus,
        last_notification_hash: dedupeKey,
        integration_processed: true,
        last_processed_at: new Date().toISOString(),
        hazard_name: normalizedFeature.hazardName,
        hazard_severity: normalizedFeature.severity,
        hazard_status: normalizedFeature.status,
        expires_at_utc: normalizedFeature.expiresAt
      });

      updates.push({
        feedName: normalizedFeature.feedName,
        featureId: normalizedFeature.featureId,
        eventId: normalizedFeature.eventId,
        district: normalizedFeature.district,
        correlationSource: normalizedFeature.correlationSource,
        matchedAreaName: normalizedFeature.matchedAreaName,
        action: "draft-created",
        notificationId: draftResult.notificationId
      });
    }
  }

  const metrics = buildHazardMetrics(updates);

  await putLedgerEntry(config, correlationId, {
    source_system: "HazardFeed",
    status: "completed",
    trigger_type: feedName,
    processed_count: updates.length,
    draft_count: drafts.length,
    metrics
  });

  logger.info("Polling hazard feed workflow.", {
    environment: config.environment,
    feedName,
    processedCount: updates.length,
    draftCount: drafts.length,
    metrics
  });

  logger.metric("HazardFeedPollSummary", {
    dimensions: {
      environment: config.environment,
      feedName
    },
    values: metrics,
    context: {
      correlationId,
      processedCount: updates.length,
      draftCount: drafts.length
    }
  });

  if (metrics.suppressionReasonCounts["missing-event-correlation"]) {
    logger.metric("HazardMissingEventCorrelation", {
      dimensions: {
        environment: config.environment,
        feedName
      },
      values: {
        count: metrics.suppressionReasonCounts["missing-event-correlation"]
      },
      context: {
        correlationId
      }
    });
  }

  if (metrics.suppressionReasonCounts["duplicate-hazard-update"]) {
    logger.metric("HazardDuplicateSuppression", {
      dimensions: {
        environment: config.environment,
        feedName
      },
      values: {
        count: metrics.suppressionReasonCounts["duplicate-hazard-update"]
      },
      context: {
        correlationId
      }
    });
  }

  return json(200, {
    processed: true,
    feedName,
    drafts,
    metrics,
    updates
  });
};
