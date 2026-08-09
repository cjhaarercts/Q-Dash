"use strict";

const fs = require("fs");
const path = require("path");

const METRICS = ["unaccountedFor", "needingHelp", "needingHelpContacted"];
const RISK_LEVELS = ["none", "low", "medium", "high"];

function usage() {
  console.error("Usage: node tools/validateHazardComparison.js <payload-json-file>");
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

function ensureNumber(errors, value, label) {
  if (!Number.isFinite(value)) {
    errors.push(`${label} must be a finite number.`);
    return false;
  }
  return true;
}

function metricCounts(errors, where, counts) {
  if (!ensureObject(errors, counts, `${where}.counts`)) {
    return null;
  }
  const out = {};
  for (const metric of METRICS) {
    out[metric] = counts[metric];
    ensureNumber(errors, counts[metric], `${where}.counts.${metric}`);
  }
  return out;
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

  const selectedHazards = payload?.whoWhatWhereHowMany?.what?.hazards;
  const overlapDistricts = payload?.whoWhatWhereHowMany?.where?.overlapDistricts;
  const deconflicted = payload?.deduplication?.overlapDeconflicted;
  const doubleCountRisk = payload?.deduplication?.doubleCountRisk;
  const hc = payload?.hazardComparison;

  ensureArray(errors, selectedHazards, "whoWhatWhereHowMany.what.hazards");
  ensureArray(errors, overlapDistricts, "whoWhatWhereHowMany.where.overlapDistricts");
  if (typeof deconflicted !== "boolean") {
    errors.push("deduplication.overlapDeconflicted must be a boolean.");
  }
  if (!RISK_LEVELS.includes(doubleCountRisk)) {
    errors.push(`deduplication.doubleCountRisk must be one of ${RISK_LEVELS.join(", ")}.`);
  }

  if (!ensureObject(errors, hc, "hazardComparison")) {
    console.error(`Hazard comparison validation failed with ${errors.length} issue(s):`);
    errors.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }

  const combined = hc.combined;
  const perHazard = hc.perHazard;
  const warning = hc.overlapWarning;

  ensureObject(errors, combined, "hazardComparison.combined");
  ensureArray(errors, perHazard, "hazardComparison.perHazard");
  ensureObject(errors, warning, "hazardComparison.overlapWarning");

  const combinedCounts = metricCounts(errors, "hazardComparison.combined", combined?.counts);

  const selectedHazardSet = new Set(Array.isArray(selectedHazards) ? selectedHazards : []);
  const seenHazardSet = new Set();
  const rawSums = { unaccountedFor: 0, needingHelp: 0, needingHelpContacted: 0 };

  if (Array.isArray(perHazard)) {
    perHazard.forEach((row, idx) => {
      const where = `hazardComparison.perHazard[${idx}]`;
      if (!ensureObject(errors, row, where)) {
        return;
      }
      if (typeof row.hazard !== "string" || row.hazard.trim().length === 0) {
        errors.push(`${where}.hazard must be a non-empty string.`);
        return;
      }
      if (seenHazardSet.has(row.hazard)) {
        errors.push(`${where}.hazard (${row.hazard}) is duplicated.`);
      }
      seenHazardSet.add(row.hazard);

      const counts = metricCounts(errors, where, row.counts);
      if (!counts) {
        return;
      }
      for (const metric of METRICS) {
        if (Number.isFinite(counts[metric])) {
          rawSums[metric] += counts[metric];
        }
      }
    });
  }

  if (Array.isArray(selectedHazards)) {
    selectedHazards.forEach((hazard, idx) => {
      if (typeof hazard !== "string" || hazard.trim().length === 0) {
        errors.push(`whoWhatWhereHowMany.what.hazards[${idx}] must be a non-empty string.`);
      }
      if (!seenHazardSet.has(hazard)) {
        errors.push(`hazardComparison.perHazard is missing hazard: ${hazard}.`);
      }
    });
  }

  seenHazardSet.forEach((hazard) => {
    if (!selectedHazardSet.has(hazard)) {
      errors.push(`hazardComparison.perHazard contains hazard not in selection: ${hazard}.`);
    }
  });

  if (ensureObject(errors, warning, "hazardComparison.overlapWarning")) {
    if (typeof warning.visible !== "boolean") {
      errors.push("hazardComparison.overlapWarning.visible must be a boolean.");
    }
    if (typeof warning.provisional !== "boolean") {
      errors.push("hazardComparison.overlapWarning.provisional must be a boolean.");
    }
    if (!RISK_LEVELS.includes(warning.risk)) {
      errors.push(`hazardComparison.overlapWarning.risk must be one of ${RISK_LEVELS.join(", ")}.`);
    }

    if (Array.isArray(overlapDistricts) && overlapDistricts.length > 0 && warning.visible !== true) {
      errors.push("overlapWarning.visible must be true when overlapDistricts is non-empty.");
    }

    if (RISK_LEVELS.includes(doubleCountRisk) && warning.risk !== doubleCountRisk) {
      errors.push("overlapWarning.risk must match deduplication.doubleCountRisk.");
    }
  }

  if (combinedCounts) {
    for (const metric of METRICS) {
      const combinedValue = combinedCounts[metric];
      const rawValue = rawSums[metric];
      if (Number.isFinite(combinedValue) && Number.isFinite(rawValue) && deconflicted === true && combinedValue > rawValue) {
        errors.push(
          `hazardComparison.combined.counts.${metric} (${combinedValue}) exceeds raw per-hazard sum (${rawValue}) while overlapDeconflicted=true.`
        );
      }
    }
  }

  if (ensureObject(errors, warning, "hazardComparison.overlapWarning") && typeof deconflicted === "boolean") {
    if (deconflicted === true && warning.provisional !== false) {
      errors.push("overlapWarning.provisional must be false when overlapDeconflicted=true.");
    }
    if (deconflicted === false && warning.provisional !== true) {
      errors.push("overlapWarning.provisional must be true when overlapDeconflicted=false.");
    }
    if (deconflicted === false && warning.visible !== true) {
      errors.push("overlapWarning.visible must be true when overlapDeconflicted=false.");
    }
  }

  const summary = {
    selectedHazards: Array.isArray(selectedHazards) ? selectedHazards.length : 0,
    comparisonHazards: seenHazardSet.size,
    rawSums,
    combined: combinedCounts,
    overlapDeconflicted: deconflicted
  };

  console.log("Hazard comparison summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (errors.length > 0) {
    console.error(`Hazard comparison validation failed with ${errors.length} issue(s):`);
    errors.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }

  console.log("Hazard comparison validation passed.");
}

main();
