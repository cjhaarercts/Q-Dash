function log(level, message, context, additionalFields) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context: context || {},
    ...(additionalFields || {})
  };

  console.log(JSON.stringify(entry));
}

function flattenMetricValues(source, prefix, target) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return target;
  }

  for (const [key, value] of Object.entries(source)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "number" && Number.isFinite(value)) {
      target[nextKey] = value;
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenMetricValues(value, nextKey, target);
    }
  }

  return target;
}

module.exports = {
  debug(message, context) {
    log("debug", message, context);
  },
  info(message, context) {
    log("info", message, context);
  },
  warn(message, context) {
    log("warn", message, context);
  },
  error(message, context) {
    log("error", message, context);
  },
  metric(metricName, options) {
    const payload = options || {};
    const dimensions = payload.dimensions && typeof payload.dimensions === "object"
      ? payload.dimensions
      : {};
    const values = flattenMetricValues(payload.values, "", {});

    log("info", `Metric ${metricName}`, payload.context || {}, {
      eventType: "metric",
      metricName,
      dimensions,
      values
    });
  }
};
