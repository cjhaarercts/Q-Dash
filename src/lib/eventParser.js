function parseJsonBody(event) {
  if (!event || !event.body) {
    return null;
  }

  try {
    return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (error) {
    return null;
  }
}

function getHeader(event, name) {
  if (!event || !event.headers) {
    return undefined;
  }

  const headerKey = Object.keys(event.headers).find(
    (key) => key.toLowerCase() === name.toLowerCase()
  );

  return headerKey ? event.headers[headerKey] : undefined;
}

module.exports = {
  getHeader,
  parseJsonBody
};
