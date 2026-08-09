const { requestJson } = require("./http");

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function buildAuthHeaders(config) {
  if (config.accessToken) {
    return {
      authorization: `Bearer ${config.accessToken}`
    };
  }

  if (config.clientId && config.clientSecret) {
    const basicToken = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
    return {
      authorization: `Basic ${basicToken}`
    };
  }

  throw new Error("Everbridge draft secret must provide either accessToken or clientId and clientSecret.");
}

function getDraftUrl(config) {
  if (config.draftEndpointUrl) {
    return config.draftEndpointUrl;
  }

  if (!config.baseUrl || !config.accountId) {
    throw new Error("Everbridge draft secret must provide baseUrl and accountId or an explicit draftEndpointUrl.");
  }

  return `${trimSlash(config.baseUrl)}/rest/notifications/${config.accountId}/drafts`;
}

function replaceTemplateValue(template, key, value) {
  return template.replace(new RegExp(`\\{${key}\\}`, "g"), encodeURIComponent(String(value)));
}

function getNotificationDetailUrl(config, notificationId) {
  if (config.notificationDetailUrlTemplate) {
    return replaceTemplateValue(config.notificationDetailUrlTemplate, "notificationId", notificationId);
  }

  if (!config.baseUrl || !config.accountId) {
    throw new Error("Everbridge retrieval config must provide baseUrl and accountId or notificationDetailUrlTemplate.");
  }

  return `${trimSlash(config.baseUrl)}/rest/notifications/${config.accountId}/${encodeURIComponent(String(notificationId))}`;
}

function getPollingUrl(config) {
  if (config.pollingEndpointUrl) {
    return config.pollingEndpointUrl;
  }

  if (!config.baseUrl || !config.accountId) {
    throw new Error("Everbridge polling config must provide baseUrl and accountId or pollingEndpointUrl.");
  }

  return `${trimSlash(config.baseUrl)}/rest/notifications/${config.accountId}`;
}

function normalizeNotificationListResponse(responseBody) {
  if (Array.isArray(responseBody)) {
    return responseBody;
  }

  if (Array.isArray(responseBody.notifications)) {
    return responseBody.notifications;
  }

  if (Array.isArray(responseBody.results)) {
    return responseBody.results;
  }

  return [];
}

async function createDraft(config, payload) {
  return requestJson(getDraftUrl(config), {
    method: "POST",
    headers: {
      ...buildAuthHeaders(config),
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(payload)
  });
}

async function getNotificationDetail(config, notificationId) {
  return requestJson(getNotificationDetailUrl(config, notificationId), {
    method: "GET",
    headers: {
      ...buildAuthHeaders(config),
      accept: "application/json"
    }
  });
}

async function listNotifications(config, options) {
  const url = new URL(getPollingUrl(config));

  if (options && options.windowMinutes) {
    url.searchParams.set("windowMinutes", String(options.windowMinutes));
  }

  if (options && options.mode) {
    url.searchParams.set("mode", String(options.mode));
  }

  const responseBody = await requestJson(url.toString(), {
    method: "GET",
    headers: {
      ...buildAuthHeaders(config),
      accept: "application/json"
    }
  });

  return normalizeNotificationListResponse(responseBody);
}

module.exports = {
  createDraft,
  getNotificationDetail,
  listNotifications
};
