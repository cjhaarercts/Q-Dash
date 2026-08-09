const REQUIRED_ENV_VARS = [
  "ENVIRONMENT",
  "ARC_GIS_RUNTIME_SECRET_ARN",
  "EVERBRIDGE_POLLING_SECRET_ARN",
  "CORRELATION_TABLE_NAME",
  "PROCESSING_LEDGER_TABLE_NAME"
];

function parseIntegerEnv(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

  return {
    environment: process.env.ENVIRONMENT || "dev",
    stateStoreMode: process.env.STATE_STORE_MODE || "auto",
    stateStoreDedupTtlSeconds: parseIntegerEnv(process.env.STATE_STORE_DEDUP_TTL_SECONDS, 1209600),
    stateStoreSpatialLookupTtlSeconds: parseIntegerEnv(process.env.STATE_STORE_SPATIAL_LOOKUP_TTL_SECONDS, 900),
    arcGisRuntimeSecretArn: process.env.ARC_GIS_RUNTIME_SECRET_ARN || "",
    arcGisWebhookSecretArn: process.env.ARC_GIS_WEBHOOK_SECRET_ARN || "",
    everbridgePollingSecretArn: process.env.EVERBRIDGE_POLLING_SECRET_ARN || "",
    everbridgeDraftSecretArn: process.env.EVERBRIDGE_DRAFT_SECRET_ARN || "",
    everbridgeWebhookSecretArn: process.env.EVERBRIDGE_WEBHOOK_SECRET_ARN || "",
    arcGisWebhookSharedSecret: process.env.ARC_GIS_WEBHOOK_SHARED_SECRET || "",
    everbridgeWebhookSharedSecret: process.env.EVERBRIDGE_WEBHOOK_SHARED_SECRET || "",
    correlationTableName: process.env.CORRELATION_TABLE_NAME || "",
    processingLedgerTableName: process.env.PROCESSING_LEDGER_TABLE_NAME || "",
    feedDedupTableName: process.env.FEED_DEDUP_TABLE_NAME || "",
    arcGisWebhookHeaderName: process.env.ARC_GIS_WEBHOOK_HEADER_NAME || "x-arcgis-webhook-secret",
    everbridgeWebhookHeaderName: process.env.EVERBRIDGE_WEBHOOK_HEADER_NAME || "x-everbridge-webhook-secret",
    missing
  };
}

module.exports = {
  getConfig
};
