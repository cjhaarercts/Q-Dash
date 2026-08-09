const { getConfig } = require("../lib/config");
const logger = require("../lib/logger");
const { badRequest, json } = require("../lib/response");
const { parseJsonBody } = require("../lib/eventParser");
const { normalizeEvent } = require("../lib/arcgisNormalization");
const { evaluateNormalizedEvent } = require("../lib/ruleEngine");

exports.handler = async function rulesEvaluator(event) {
  const config = getConfig();
  const payload = parseJsonBody(event) || event;
  const normalizedEvent = payload && payload.record ? normalizeEvent(payload) : payload;

  if (!normalizedEvent || !normalizedEvent.eventId || !normalizedEvent.district) {
    return badRequest("Rules evaluation requires eventId and district.");
  }

  const evaluation = evaluateNormalizedEvent(normalizedEvent);
  if (!evaluation.isValid) {
    return badRequest(evaluation.message);
  }

  logger.info("Evaluating SITREP automation rules.", {
    environment: config.environment,
    eventId: normalizedEvent.eventId,
    district: normalizedEvent.district,
    triggerType: normalizedEvent.triggerType,
    dedupeHash: evaluation.dedupeHash || null,
    matchedTriggers: (evaluation.matchedTriggers || []).map((trigger) => trigger.triggerId)
  });

  return json(200, {
    shouldCreateDraft: evaluation.shouldCreateDraft,
    messageType: evaluation.messageType || null,
    triggerId: evaluation.triggerId || null,
    reason: evaluation.reason || evaluation.suppressionReason,
    suppressionReason: evaluation.suppressionReason || null,
    dedupeHash: evaluation.dedupeHash || null,
    matchedTriggers: evaluation.matchedTriggers || [],
    updates: evaluation.updates
  });
};
