const { getConfig } = require("../lib/config");
const logger = require("../lib/logger");
const { badRequest, json, serverError } = require("../lib/response");
const { parseJsonBody } = require("../lib/eventParser");
const { resolveJsonSecret } = require("../lib/secrets");
const { createDraft } = require("../lib/everbridgeClient");

function buildDraftNotificationId(eventId, district, messageType) {
  return ["EB", eventId, district || "NA", messageType || "draft", Date.now()].join("-");
}

async function executeDraftCreation(event) {
  const config = getConfig();
  const payload = parseJsonBody(event) || event;

  if (!payload || !payload.eventId || !payload.messageType) {
    return badRequest("Everbridge draft creation requires eventId and messageType.");
  }

  const everbridgeDraftConfig = await resolveJsonSecret(config.everbridgeDraftSecretArn);
  if (!everbridgeDraftConfig) {
    return serverError("Everbridge draft secret is not configured.");
  }

  const upstreamResponse = await createDraft(everbridgeDraftConfig, payload);
  const notificationId = upstreamResponse.notificationId || upstreamResponse.id || buildDraftNotificationId(payload.eventId, payload.district, payload.messageType);

  logger.info("Created Everbridge draft request.", {
    environment: config.environment,
    eventId: payload.eventId,
    district: payload.district || null,
    messageType: payload.messageType,
    baseUrl: everbridgeDraftConfig && everbridgeDraftConfig.baseUrl ? everbridgeDraftConfig.baseUrl : null,
    accountId: everbridgeDraftConfig && everbridgeDraftConfig.accountId ? everbridgeDraftConfig.accountId : null
  });

  return {
    created: true,
    notificationId,
    status: upstreamResponse.status || "draft",
    approvalStatus: upstreamResponse.approvalStatus || "pending-review",
    messageType: payload.messageType,
    request: payload,
    accountId: everbridgeDraftConfig && everbridgeDraftConfig.accountId ? everbridgeDraftConfig.accountId : null,
    baseUrl: everbridgeDraftConfig && everbridgeDraftConfig.baseUrl ? everbridgeDraftConfig.baseUrl : null,
    upstreamResponse
  };
}

exports.executeDraftCreation = executeDraftCreation;

exports.handler = async function everbridgeDraftCreator(event) {
  const result = await executeDraftCreation(event);

  if (result && result.statusCode) {
    return result;
  }

  return json(200, result);
};
