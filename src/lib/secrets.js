const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const logger = require("./logger");

let client;
const cache = new Map();

function getClient() {
  if (!client) {
    client = new SecretsManagerClient({});
  }

  return client;
}

async function getSecretValue(secretArn) {
  if (!secretArn) {
    return null;
  }

  if (cache.has(secretArn)) {
    return cache.get(secretArn);
  }

  const response = await getClient().send(
    new GetSecretValueCommand({
      SecretId: secretArn
    })
  );

  const secretString = response.SecretString || "";
  let secretValue = secretString;

  try {
    secretValue = JSON.parse(secretString);
  } catch (_error) {
    secretValue = secretString;
  }

  cache.set(secretArn, secretValue);
  return secretValue;
}

async function resolveWebhookSharedSecret({ configuredSharedSecret, secretArn, environment, secretType }) {
  if (configuredSharedSecret) {
    return configuredSharedSecret;
  }

  const secretValue = await getSecretValue(secretArn);
  if (!secretValue) {
    return "";
  }

  if (typeof secretValue === "string") {
    return secretValue;
  }

  if (typeof secretValue.sharedSecret === "string") {
    return secretValue.sharedSecret;
  }

  logger.warn("Webhook secret payload did not include sharedSecret.", {
    environment,
    secretType
  });

  return "";
}

async function resolveJsonSecret(secretArn) {
  const secretValue = await getSecretValue(secretArn);

  if (!secretValue) {
    return null;
  }

  return typeof secretValue === "object" ? secretValue : { value: secretValue };
}

module.exports = {
  getSecretValue,
  resolveJsonSecret,
  resolveWebhookSharedSecret
};
