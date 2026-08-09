async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await parseResponseBody(response);

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} returned from ${url}`);
    error.statusCode = response.status;
    error.responseBody = body;
    throw error;
  }

  return body;
}

function toFormUrlEncoded(payload) {
  const params = new URLSearchParams();

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });

  return params;
}

module.exports = {
  requestJson,
  toFormUrlEncoded
};
