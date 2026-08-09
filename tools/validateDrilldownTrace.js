"use strict";

const fs = require("fs");
const path = require("path");

const METRICS = ["unaccountedFor", "needingHelp", "needingHelpContacted"];
const CONFIDENCE = ["potential", "reported", "confirmed"];

function usage() {
  console.error("Usage: node tools/validateDrilldownTrace.js <payload-json-file>");
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

function ensureObject(errors, value, label) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  return true;
}

function ensureArray(errors, value, label) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return false;
  }
  return true;
}

function ensureNonEmptyString(errors, value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string.`);
    return false;
  }
  return true;
}

function ensureFinite(errors, value, label) {
  if (!Number.isFinite(value)) {
    errors.push(`${label} must be a finite number.`);
    return false;
  }
  return true;
}

function parseUtc(errors, value, label) {
  if (!ensureNonEmptyString(errors, value, label)) {
    return null;
  }
  const epoch = Date.parse(value);
  if (Number.isNaN(epoch)) {
    errors.push(`${label} must be a valid timestamp string.`);
    return null;
  }
  return epoch;
}

function validateDistrictDetails(errors, districtDetails) {
  if (!ensureArray(errors, districtDetails, "districtDetails")) {
    return null;
  }

  const byDistrict = new Map();
  let previousEpoch = null;

  districtDetails.forEach((row, idx) => {
    const where = `districtDetails[${idx}]`;
    if (!ensureObject(errors, row, where)) {
      return;
    }

    if (!ensureNonEmptyString(errors, row.district, `${where}.district`)) {
      return;
    }
    if (byDistrict.has(row.district)) {
      errors.push(`${where}.district (${row.district}) is duplicated.`);
    }

    ensureNonEmptyString(errors, row.eventId, `${where}.eventId`);
    ensureArray(errors, row.hazards, `${where}.hazards`);
    ensureNonEmptyString(errors, row.source, `${where}.source`);

    const rowEpoch = parseUtc(errors, row.latestUpdateUtc, `${where}.latestUpdateUtc`);
    if (rowEpoch !== null && previousEpoch !== null && rowEpoch > previousEpoch) {
      errors.push(`${where}.latestUpdateUtc is newer than previous row; expected descending sort.`);
    }
    if (rowEpoch !== null) {
      previousEpoch = rowEpoch;
    }

    if (!ensureArray(errors, row.everbridgeNotificationIds, `${where}.everbridgeNotificationIds`)) {
      return;
    }

    const idSet = new Set();
    row.everbridgeNotificationIds.forEach((id, idIdx) => {
      const idWhere = `${where}.everbridgeNotificationIds[${idIdx}]`;
      if (!ensureNonEmptyString(errors, id, idWhere)) {
        return;
      }
      if (idSet.has(id)) {
        errors.push(`${idWhere} duplicates an ID in the same district row.`);
      }
      idSet.add(id);
    });

    if (ensureObject(errors, row.counts, `${where}.counts`)) {
      METRICS.forEach((metric) => ensureFinite(errors, row.counts[metric], `${where}.counts.${metric}`));
    }

    if (ensureObject(errors, row.drillDown, `${where}.drillDown`)) {
      ensureFinite(errors, row.drillDown.recordCount, `${where}.drillDown.recordCount`);
      if (!CONFIDENCE.includes(row.drillDown.confidenceState)) {
        errors.push(`${where}.drillDown.confidenceState must be one of ${CONFIDENCE.join(", ")}.`);
      }
      ensureArray(errors, row.drillDown.provenance, `${where}.drillDown.provenance`);
    }

    byDistrict.set(row.district, {
      district: row.district,
      eventId: row.eventId,
      latestUpdateUtc: row.latestUpdateUtc,
      source: row.source,
      idSet
    });
  });

  return byDistrict;
}

function validateTrace(errors, traceRows, byDistrict) {
  if (!ensureArray(errors, traceRows, "notificationTrace")) {
    return;
  }

  traceRows.forEach((row, idx) => {
    const where = `notificationTrace[${idx}]`;
    if (!ensureObject(errors, row, where)) {
      return;
    }

    if (!ensureNonEmptyString(errors, row.district, `${where}.district`)) {
      return;
    }

    const district = byDistrict ? byDistrict.get(row.district) : null;
    if (!district) {
      errors.push(`${where}.district (${row.district}) is missing from districtDetails.`);
      return;
    }

    ensureNonEmptyString(errors, row.eventId, `${where}.eventId`);
    ensureNonEmptyString(errors, row.latestSource, `${where}.latestSource`);
    parseUtc(errors, row.latestUpdateUtc, `${where}.latestUpdateUtc`);

    if (row.eventId !== district.eventId) {
      errors.push(`${where}.eventId does not match districtDetails eventId for ${row.district}.`);
    }
    if (row.latestSource !== district.source) {
      errors.push(`${where}.latestSource does not match districtDetails source for ${row.district}.`);
    }
    if (row.latestUpdateUtc !== district.latestUpdateUtc) {
      errors.push(`${where}.latestUpdateUtc does not match districtDetails latestUpdateUtc for ${row.district}.`);
    }

    if (!ensureArray(errors, row.everbridgeNotificationIds, `${where}.everbridgeNotificationIds`)) {
      return;
    }

    row.everbridgeNotificationIds.forEach((id, idIdx) => {
      const idWhere = `${where}.everbridgeNotificationIds[${idIdx}]`;
      if (!ensureNonEmptyString(errors, id, idWhere)) {
        return;
      }
      if (!district.idSet.has(id)) {
        errors.push(`${idWhere} is not present in districtDetails IDs for ${row.district}.`);
      }
    });
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
  if (!ensureObject(errors, payload, "payload")) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  const byDistrict = validateDistrictDetails(errors, payload.districtDetails);
  validateTrace(errors, payload.notificationTrace, byDistrict);

  const summary = {
    districtRows: Array.isArray(payload.districtDetails) ? payload.districtDetails.length : 0,
    traceRows: Array.isArray(payload.notificationTrace) ? payload.notificationTrace.length : 0
  };

  console.log("Drill-down and trace summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (errors.length > 0) {
    console.error(`Drill-down/trace validation failed with ${errors.length} issue(s):`);
    errors.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }

  console.log("Drill-down/trace validation passed.");
}

main();
