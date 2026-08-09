const { requestJson, toFormUrlEncoded } = require("./http");

function trimSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function getPortalBaseUrl(config) {
  return trimSlash(config.tokenUrl ? config.tokenUrl.replace(/\/sharing\/rest\/generateToken$/i, "") : config.baseUrl);
}

async function getToken(config) {
  if (config.accessToken) {
    return config.accessToken;
  }

  if (!config.baseUrl || !config.username || !config.password) {
    throw new Error("ArcGIS runtime secret must provide either accessToken or baseUrl, username, and password.");
  }

  const portalBaseUrl = getPortalBaseUrl(config);
  const tokenUrl = config.tokenUrl || `${portalBaseUrl}/sharing/rest/generateToken`;
  const form = toFormUrlEncoded({
    f: "json",
    username: config.username,
    password: config.password,
    client: "referer",
    referer: config.referer || portalBaseUrl,
    expiration: config.expirationMinutes || 60
  });

  const tokenResponse = await requestJson(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  if (!tokenResponse || !tokenResponse.token) {
    const upstreamMessage = tokenResponse && tokenResponse.error && tokenResponse.error.message
      ? tokenResponse.error.message
      : "ArcGIS token response did not include a token.";
    const upstreamDetails = tokenResponse && tokenResponse.error && Array.isArray(tokenResponse.error.details)
      ? tokenResponse.error.details.filter(Boolean).join("; ")
      : "";

    throw new Error(
      upstreamDetails
        ? `ArcGIS token request failed: ${upstreamMessage} (${upstreamDetails})`
        : `ArcGIS token request failed: ${upstreamMessage}`
    );
  }

  return tokenResponse.token;
}

function buildArcGisFeature(attributes) {
  return {
    attributes
  };
}

async function addFeature(tableUrl, token, attributes) {
  const form = toFormUrlEncoded({
    f: "json",
    token,
    features: JSON.stringify([buildArcGisFeature(attributes)])
  });

  return requestJson(`${trimSlash(tableUrl)}/addFeatures`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });
}

async function updateFeature(layerUrl, token, attributes) {
  const form = toFormUrlEncoded({
    f: "json",
    token,
    features: JSON.stringify([buildArcGisFeature(attributes)])
  });

  return requestJson(`${trimSlash(layerUrl)}/updateFeatures`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });
}

async function queryFeatures(layerUrl, token, options) {
  const form = toFormUrlEncoded({
    f: "json",
    token,
    where: options && options.where ? options.where : "1=1",
    geometry: options && options.geometry ? JSON.stringify(options.geometry) : undefined,
    geometryType: options && options.geometryType ? options.geometryType : undefined,
    spatialRel: options && options.spatialRel ? options.spatialRel : undefined,
    inSR: options && options.inSR ? options.inSR : undefined,
    outFields: Array.isArray(options && options.outFields) ? options.outFields.join(",") : "*",
    returnGeometry: options && options.returnGeometry !== undefined ? String(options.returnGeometry) : "false",
    resultRecordCount: options && options.resultRecordCount ? String(options.resultRecordCount) : undefined
  });

  return requestJson(`${trimSlash(layerUrl)}/query`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });
}

module.exports = {
  addFeature,
  getToken,
  queryFeatures,
  updateFeature
};
