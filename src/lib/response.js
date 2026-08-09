function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  };
}

function accepted(correlationId, action) {
  return json(202, {
    accepted: true,
    correlationId,
    action
  });
}

function acceptedWithDetails(correlationId, action, details) {
  return json(202, {
    accepted: true,
    correlationId,
    action,
    details: details || null
  });
}

function badRequest(message, details) {
  return json(400, {
    accepted: false,
    errorCode: "BAD_REQUEST",
    message,
    details: details || null
  });
}

function unauthorized(message, details) {
  return json(401, {
    accepted: false,
    errorCode: "UNAUTHORIZED",
    message,
    details: details || null
  });
}

function badGateway(message, details) {
  return json(502, {
    accepted: false,
    errorCode: "BAD_GATEWAY",
    message,
    details: details || null
  });
}

function serverError(message, details) {
  return json(500, {
    accepted: false,
    errorCode: "SERVER_ERROR",
    message,
    details: details || null
  });
}

module.exports = {
  accepted,
  acceptedWithDetails,
  badGateway,
  badRequest,
  json,
  serverError,
  unauthorized
};
