const crypto = require("crypto");

function hasConfiguredSecret(secret) {
  return typeof secret === "string" && secret.length > 0;
}

function secretsMatch(expectedSecret, receivedSecret) {
  if (!hasConfiguredSecret(expectedSecret) || typeof receivedSecret !== "string") {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedSecret, "utf8");
  const receivedBuffer = Buffer.from(receivedSecret, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

module.exports = {
  hasConfiguredSecret,
  secretsMatch
};
