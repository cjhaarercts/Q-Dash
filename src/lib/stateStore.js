const {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand
} = require("@aws-sdk/client-dynamodb");

let dynamoClient;
const memoryCorrelation = new Map();
const memoryLedger = new Map();
const memoryDedup = new Map();

function getDynamoClient() {
  if (!dynamoClient) {
    dynamoClient = new DynamoDBClient({});
  }

  return dynamoClient;
}

function shouldUseMemoryStore(config) {
  return config.stateStoreMode === "memory" || (config.stateStoreMode === "auto" && config.environment === "test");
}

function toAttributeValue(value) {
  if (value === null || value === undefined) {
    return { NULL: true };
  }

  if (typeof value === "boolean") {
    return { BOOL: value };
  }

  if (typeof value === "number") {
    return { N: String(value) };
  }

  if (typeof value === "object") {
    return { S: JSON.stringify(value) };
  }

  return { S: String(value) };
}

function fromAttributeValue(attribute) {
  if (!attribute) {
    return null;
  }

  if (attribute.S !== undefined) {
    try {
      return JSON.parse(attribute.S);
    } catch (_error) {
      return attribute.S;
    }
  }

  if (attribute.N !== undefined) {
    return Number(attribute.N);
  }

  if (attribute.BOOL !== undefined) {
    return attribute.BOOL;
  }

  if (attribute.NULL) {
    return null;
  }

  return null;
}

function buildItemFromRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, toAttributeValue(value)]));
}

function parseItemToRecord(item) {
  if (!item) {
    return null;
  }

  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, fromAttributeValue(value)]));
}

async function hasDeduplicationKey(config, sourceKey) {
  if (shouldUseMemoryStore(config)) {
    return memoryDedup.has(sourceKey);
  }

  const response = await getDynamoClient().send(
    new GetItemCommand({
      TableName: config.feedDedupTableName,
      Key: {
        source_key: { S: sourceKey }
      }
    })
  );

  return Boolean(response.Item);
}

async function recordDeduplicationKey(config, sourceKey, metadata) {
  const expiresAtEpoch = Math.floor(Date.now() / 1000) + config.stateStoreDedupTtlSeconds;
  const record = {
    source_key: sourceKey,
    recorded_at_utc: new Date().toISOString(),
    expires_at_epoch: expiresAtEpoch,
    metadata: metadata || {}
  };

  if (shouldUseMemoryStore(config)) {
    memoryDedup.set(sourceKey, record);
    return record;
  }

  await getDynamoClient().send(
    new PutItemCommand({
      TableName: config.feedDedupTableName,
      Item: buildItemFromRecord(record)
    })
  );

  return record;
}

async function claimDeduplicationKey(config, sourceKey, metadata) {
  if (shouldUseMemoryStore(config)) {
    if (memoryDedup.has(sourceKey)) {
      return {
        claimed: false,
        record: memoryDedup.get(sourceKey)
      };
    }

    const record = await recordDeduplicationKey(config, sourceKey, metadata);
    return {
      claimed: true,
      record
    };
  }

  const expiresAtEpoch = Math.floor(Date.now() / 1000) + config.stateStoreDedupTtlSeconds;
  const record = {
    source_key: sourceKey,
    recorded_at_utc: new Date().toISOString(),
    expires_at_epoch: expiresAtEpoch,
    metadata: metadata || {}
  };

  try {
    await getDynamoClient().send(
      new PutItemCommand({
        TableName: config.feedDedupTableName,
        Item: buildItemFromRecord(record),
        ConditionExpression: "attribute_not_exists(source_key)"
      })
    );

    return {
      claimed: true,
      record
    };
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException || error.name === "ConditionalCheckFailedException") {
      return {
        claimed: false,
        record: await getDeduplicationRecord(config, sourceKey)
      };
    }

    throw error;
  }
}

async function getDeduplicationRecord(config, sourceKey) {
  if (shouldUseMemoryStore(config)) {
    const memoryRecord = memoryDedup.get(sourceKey) || null;
    if (memoryRecord && memoryRecord.expires_at_epoch && memoryRecord.expires_at_epoch <= Math.floor(Date.now() / 1000)) {
      memoryDedup.delete(sourceKey);
      return null;
    }

    return memoryRecord;
  }

  const response = await getDynamoClient().send(
    new GetItemCommand({
      TableName: config.feedDedupTableName,
      Key: {
        source_key: { S: sourceKey }
      }
    })
  );

  return parseItemToRecord(response.Item);
}

async function getSpatialLookupMemo(config, sourceKey) {
  const record = await getDeduplicationRecord(config, sourceKey);
  if (!record || record.memo_type !== "spatial_lookup") {
    return null;
  }

  if (record.expires_at_epoch && record.expires_at_epoch <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return record;
}

async function putSpatialLookupMemo(config, sourceKey, value, metadata) {
  const expiresAtEpoch = Math.floor(Date.now() / 1000) + config.stateStoreSpatialLookupTtlSeconds;
  const record = {
    source_key: sourceKey,
    memo_type: "spatial_lookup",
    recorded_at_utc: new Date().toISOString(),
    expires_at_epoch: expiresAtEpoch,
    value: value || null,
    metadata: metadata || {}
  };

  if (shouldUseMemoryStore(config)) {
    memoryDedup.set(sourceKey, record);
    return record;
  }

  await getDynamoClient().send(
    new PutItemCommand({
      TableName: config.feedDedupTableName,
      Item: buildItemFromRecord(record)
    })
  );

  return record;
}

async function getLedgerEntry(config, correlationId) {
  if (shouldUseMemoryStore(config)) {
    return memoryLedger.get(correlationId) || null;
  }

  const response = await getDynamoClient().send(
    new GetItemCommand({
      TableName: config.processingLedgerTableName,
      Key: {
        correlation_id: { S: correlationId }
      }
    })
  );

  return parseItemToRecord(response.Item);
}

function buildCorrelationKeys(eventId, district, recordType = "notification-state") {
  return {
    pk: `EVENT#${eventId}`,
    sk: `DISTRICT#${district}#TYPE#${recordType}`
  };
}

function buildMemoryCorrelationKey(pk, sk) {
  return `${pk}|${sk}`;
}

async function getCorrelationRecord(config, eventId, district, recordType) {
  const keys = buildCorrelationKeys(eventId, district, recordType);

  if (shouldUseMemoryStore(config)) {
    return memoryCorrelation.get(buildMemoryCorrelationKey(keys.pk, keys.sk)) || null;
  }

  const response = await getDynamoClient().send(
    new GetItemCommand({
      TableName: config.correlationTableName,
      Key: buildItemFromRecord(keys)
    })
  );

  return parseItemToRecord(response.Item);
}

async function putCorrelationRecord(config, eventId, district, record) {
  const keys = buildCorrelationKeys(eventId, district, record.record_type);
  const storedRecord = {
    ...keys,
    recorded_at_utc: new Date().toISOString(),
    ...record
  };

  if (shouldUseMemoryStore(config)) {
    memoryCorrelation.set(buildMemoryCorrelationKey(keys.pk, keys.sk), storedRecord);
    return storedRecord;
  }

  await getDynamoClient().send(
    new PutItemCommand({
      TableName: config.correlationTableName,
      Item: buildItemFromRecord(storedRecord)
    })
  );

  return storedRecord;
}

async function putLedgerEntry(config, correlationId, entry) {
  const record = {
    correlation_id: correlationId,
    recorded_at_utc: new Date().toISOString(),
    ...entry
  };

  if (shouldUseMemoryStore(config)) {
    memoryLedger.set(correlationId, record);
    return record;
  }

  await getDynamoClient().send(
    new PutItemCommand({
      TableName: config.processingLedgerTableName,
      Item: buildItemFromRecord(record)
    })
  );

  return record;
}

function buildDraftDedupKey(normalizedEvent, evaluation) {
  return ["draft", normalizedEvent.eventId, normalizedEvent.district, evaluation.dedupeHash].join(":");
}

function buildEverbridgeCallbackDedupKey(payload) {
  return [
    "everbridge-callback",
    payload.notificationId || payload.notification_id || "unknown",
    payload.status || "unknown"
  ].join(":");
}

function buildEverbridgePollDedupKey(notification) {
  return [
    "everbridge-poll",
    notification.notificationId || notification.notification_id || notification.id || "unknown",
    notification.lastUpdated || notification.updatedAt || notification.modifiedAt || notification.status || "unknown"
  ].join(":");
}

function clearMemoryState() {
  memoryCorrelation.clear();
  memoryLedger.clear();
  memoryDedup.clear();
}

module.exports = {
  buildDraftDedupKey,
  buildEverbridgeCallbackDedupKey,
  buildEverbridgePollDedupKey,
  claimDeduplicationKey,
  clearMemoryState,
  getCorrelationRecord,
  getLedgerEntry,
  getDeduplicationRecord,
  getSpatialLookupMemo,
  hasDeduplicationKey,
  putCorrelationRecord,
  putLedgerEntry,
  putSpatialLookupMemo,
  recordDeduplicationKey
};