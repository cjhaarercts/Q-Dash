"use strict";

const fs = require("fs");
const path = require("path");

const SUPPORTED_METRICS = ["unaccountedFor", "needingHelp", "needingHelpContacted"];
const ALLOWED_CONFIDENCE = ["potential", "reported", "confirmed"];
const ALLOWED_OVERLAP = ["none", "low", "medium", "high"];

function usage() {
  console.error("Usage: node tools/validateHeatMap.js <payload-json-file>");
}

function loadPayload(fileArg) {
  const payloadPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`File not found: ${payloadPath}`);
  }
  return JSON.parse(fs.readFileSync(payloadPath, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(errors, value, name) {
  if (!isObject(value)) {
    errors.push(`${name} must be an object.`);
    return false;
  }
  return true;
}

function assertArray(errors, value, name) {
  if (!Array.isArray(value)) {
    errors.push(`${name} must be an array.`);
    return false;
  }
  return true;
}

function assertFinite(errors, value, name) {
  if (!Number.isFinite(value)) {
    errors.push(`${name} must be a finite number.`);
    return false;
  }
  return true;
}

function validateBuckets(errors, buckets) {
  if (!assertArray(errors, buckets, "heatMap.buckets")) {
    return;
  }
  if (buckets.length === 0) {
    errors.push("heatMap.buckets must not be empty.");
    return;
  }

  let previousMax = null;
  for (let i = 0; i < buckets.length; i += 1) {
    const bucket = buckets[i];
    const where = `heatMap.buckets[${i}]`;
    if (!assertObject(errors, bucket, where)) {
      continue;
    }
    assertFinite(errors, bucket.min, `${where}.min`);
    assertFinite(errors, bucket.max, `${where}.max`);
    if (typeof bucket.label !== "string" || bucket.label.trim().length === 0) {
      errors.push(`${where}.label must be a non-empty string.`);
    }

    if (Number.isFinite(bucket.min) && Number.isFinite(bucket.max)) {
      if (!Number.isInteger(bucket.min) || !Number.isInteger(bucket.max)) {
        errors.push(`${where}.min and ${where}.max must be integers.`);
      }
      if (bucket.max < bucket.min) {
        errors.push(`${where}.max must be greater than or equal to ${where}.min.`);
      }
      if (previousMax !== null && bucket.min !== previousMax + 1) {
        errors.push(`${where}.min must be contiguous with previous bucket max (${previousMax}).`);
      }
      previousMax = bucket.max;
    }
  }
}

function validateDistrictValues(errors, payload) {
  const heatMap = payload.heatMap;
  const districtDetails = payload.districtDetails;

  if (!assertObject(errors, heatMap, "heatMap")) {
    return;
  }
  if (!assertArray(errors, heatMap.districtValues, "heatMap.districtValues")) {
    return;
  }
  if (!assertArray(errors, districtDetails, "districtDetails")) {
    return;
  }

  const detailByDistrict = new Map();
  districtDetails.forEach((row, idx) => {
    const where = `districtDetails[${idx}]`;
    if (!isObject(row)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    if (typeof row.district !== "string" || row.district.trim().length === 0) {
      errors.push(`${where}.district must be a non-empty string.`);
      return;
    }
    detailByDistrict.set(row.district, row);
  });

  heatMap.districtValues.forEach((row, idx) => {
    const where = `heatMap.districtValues[${idx}]`;
    if (!assertObject(errors, row, where)) {
      return;
    }

    if (typeof row.district !== "string" || row.district.trim().length === 0) {
      errors.push(`${where}.district must be a non-empty string.`);
      return;
    }

    if (!ALLOWED_CONFIDENCE.includes(row.confidenceState)) {
      errors.push(`${where}.confidenceState must be one of ${ALLOWED_CONFIDENCE.join(", ")}.`);
    }

    if (!ALLOWED_OVERLAP.includes(row.overlapRisk)) {
      errors.push(`${where}.overlapRisk must be one of ${ALLOWED_OVERLAP.join(", ")}.`);
    }

    if (!assertObject(errors, row.counts, `${where}.counts`)) {
      return;
    }

    for (const metric of SUPPORTED_METRICS) {
      assertFinite(errors, row.counts[metric], `${where}.counts.${metric}`);
    }

    const detail = detailByDistrict.get(row.district);
    if (!detail) {
      errors.push(`${where}.district (${row.district}) has no matching districtDetails row.`);
      return;
    }

    if (!isObject(detail.counts)) {
      errors.push(`districtDetails entry for ${row.district} is missing counts object.`);
      return;
    }

    for (const metric of SUPPORTED_METRICS) {
      const heatValue = row.counts[metric];
      const detailValue = detail.counts[metric];
      if (Number.isFinite(heatValue) && Number.isFinite(detailValue) && heatValue !== detailValue) {
        errors.push(
          `${where}.counts.${metric} (${heatValue}) does not match districtDetails count (${detailValue}) for district ${row.district}.`
        );
      }
    }
  });
}

function main() {
  const payloadArg = process.argv[2];
  if (!payloadArg) {
    usage();
    process.exit(2);
  }

  let payload;
  try {
    payload = loadPayload(payloadArg);
  } catch (error) {
    console.error(`Failed to load payload: ${error.message}`);
    process.exit(2);
  }

  const errors = [];
  if (!assertObject(errors, payload, "payload")) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  if (!assertObject(errors, payload.heatMap, "heatMap")) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  if (!SUPPORTED_METRICS.includes(payload.heatMap.metric)) {
    errors.push(`heatMap.metric must be one of ${SUPPORTED_METRICS.join(", ")}.`);
  }

  validateBuckets(errors, payload.heatMap.buckets);
  validateDistrictValues(errors, payload);

  const overlapDeconflicted = payload?.deduplication?.overlapDeconflicted;
  if (typeof overlapDeconflicted !== "boolean") {
    errors.push("deduplication.overlapDeconflicted must be a boolean.");
  }

  const summary = {
    metric: payload.heatMap.metric,
    bucketCount: Array.isArray(payload.heatMap.buckets) ? payload.heatMap.buckets.length : 0,
    districtValueCount: Array.isArray(payload.heatMap.districtValues)
      ? payload.heatMap.districtValues.length
      : 0,
    overlapDeconflicted
  };

  console.log("Heat map summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (errors.length > 0) {
    console.error(`Heat map validation failed with ${errors.length} issue(s):`);
    errors.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }

  console.log("Heat map validation passed.");
}

main();
