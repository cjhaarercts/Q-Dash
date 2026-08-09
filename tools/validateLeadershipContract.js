"use strict";

const fs = require("fs");
const path = require("path");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function addError(errors, condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function expectArrayOfStrings(errors, value, label, allowEmpty = true) {
  addError(errors, Array.isArray(value), `${label} must be an array.`);
  if (!Array.isArray(value)) {
    return;
  }
  if (!allowEmpty) {
    addError(errors, value.length > 0, `${label} must contain at least one value.`);
  }
  value.forEach((item, index) => {
    addError(errors, typeof item === "string" && item.trim().length > 0, `${label}[${index}] must be a non-empty string.`);
  });
}

function validateBucket(errors, bucket, index) {
  const label = `heatMap.buckets[${index}]`;
  addError(errors, isObject(bucket), `${label} must be an object.`);
  if (!isObject(bucket)) {
    return;
  }
  addError(errors, typeof bucket.label === "string" && bucket.label.trim(), `${label}.label must be a non-empty string.`);
  addError(errors, isNumber(bucket.min), `${label}.min must be a finite number.`);
  addError(errors, isNumber(bucket.max), `${label}.max must be a finite number.`);
  if (isNumber(bucket.min) && isNumber(bucket.max)) {
    addError(errors, bucket.min <= bucket.max, `${label}.min must be less than or equal to .max.`);
  }
}

function validateDistrictValue(errors, row, index) {
  const label = `heatMap.districtValues[${index}]`;
  addError(errors, isObject(row), `${label} must be an object.`);
  if (!isObject(row)) {
    return;
  }

  addError(errors, typeof row.district === "string" && row.district.trim(), `${label}.district must be a non-empty string.`);
  expectArrayOfStrings(errors, row.hazards, `${label}.hazards`, true);

  addError(errors, isObject(row.counts), `${label}.counts must be an object.`);
  if (isObject(row.counts)) {
    addError(errors, isNumber(row.counts.unaccountedFor), `${label}.counts.unaccountedFor must be a finite number.`);
    addError(errors, isNumber(row.counts.needingHelp), `${label}.counts.needingHelp must be a finite number.`);
    addError(errors, isNumber(row.counts.needingHelpContacted), `${label}.counts.needingHelpContacted must be a finite number.`);
  }

  addError(errors, ["potential", "reported", "confirmed"].includes(row.confidenceState), `${label}.confidenceState must be one of potential/reported/confirmed.`);
  addError(errors, ["low", "medium", "high"].includes(row.overlapRisk), `${label}.overlapRisk must be one of low/medium/high.`);
}

function validateDistrictDetail(errors, row, index) {
  const label = `districtDetails[${index}]`;
  addError(errors, isObject(row), `${label} must be an object.`);
  if (!isObject(row)) {
    return;
  }

  addError(errors, typeof row.district === "string" && row.district.trim(), `${label}.district must be a non-empty string.`);
  addError(errors, typeof row.eventId === "string" && row.eventId.trim(), `${label}.eventId must be a non-empty string.`);
  expectArrayOfStrings(errors, row.hazards, `${label}.hazards`, true);
  addError(errors, typeof row.latestUpdateUtc === "string" && row.latestUpdateUtc.trim(), `${label}.latestUpdateUtc must be a non-empty string.`);
  addError(errors, typeof row.source === "string" && row.source.trim(), `${label}.source must be a non-empty string.`);
  expectArrayOfStrings(errors, row.everbridgeNotificationIds, `${label}.everbridgeNotificationIds`, true);

  addError(errors, isObject(row.counts), `${label}.counts must be an object.`);
  if (isObject(row.counts)) {
    addError(errors, isNumber(row.counts.unaccountedFor), `${label}.counts.unaccountedFor must be a finite number.`);
    addError(errors, isNumber(row.counts.needingHelp), `${label}.counts.needingHelp must be a finite number.`);
    addError(errors, isNumber(row.counts.needingHelpContacted), `${label}.counts.needingHelpContacted must be a finite number.`);
  }

  addError(errors, isObject(row.drillDown), `${label}.drillDown must be an object.`);
  if (isObject(row.drillDown)) {
    addError(errors, Number.isInteger(row.drillDown.recordCount), `${label}.drillDown.recordCount must be an integer.`);
    addError(errors, ["potential", "reported", "confirmed"].includes(row.drillDown.confidenceState), `${label}.drillDown.confidenceState must be one of potential/reported/confirmed.`);
    expectArrayOfStrings(errors, row.drillDown.provenance, `${label}.drillDown.provenance`, true);
  }
}

function validatePayload(payload) {
  const errors = [];

  addError(errors, isObject(payload), "Payload must be a JSON object.");
  if (!isObject(payload)) {
    return errors;
  }

  addError(errors, typeof payload.eventId === "string" && payload.eventId.trim(), "eventId must be a non-empty string.");
  addError(errors, typeof payload.generatedAtUtc === "string" && payload.generatedAtUtc.trim(), "generatedAtUtc must be a non-empty string.");

  addError(errors, isObject(payload.whoWhatWhereHowMany), "whoWhatWhereHowMany must be an object.");
  if (isObject(payload.whoWhatWhereHowMany)) {
    const section = payload.whoWhatWhereHowMany;

    addError(errors, isObject(section.who), "whoWhatWhereHowMany.who must be an object.");
    if (isObject(section.who)) {
      addError(errors, isNumber(section.who.potentiallyAffectedMembers), "whoWhatWhereHowMany.who.potentiallyAffectedMembers must be a finite number.");
      addError(errors, isNumber(section.who.reportedMembers), "whoWhatWhereHowMany.who.reportedMembers must be a finite number.");
    }

    addError(errors, isObject(section.what), "whoWhatWhereHowMany.what must be an object.");
    if (isObject(section.what)) {
      expectArrayOfStrings(errors, section.what.hazards, "whoWhatWhereHowMany.what.hazards", false);
      addError(errors, isNumber(section.what.activeNotifications), "whoWhatWhereHowMany.what.activeNotifications must be a finite number.");
    }

    addError(errors, isObject(section.where), "whoWhatWhereHowMany.where must be an object.");
    if (isObject(section.where)) {
      expectArrayOfStrings(errors, section.where.districts, "whoWhatWhereHowMany.where.districts", false);
      expectArrayOfStrings(errors, section.where.overlapDistricts, "whoWhatWhereHowMany.where.overlapDistricts", true);
    }

    addError(errors, isObject(section.howMany), "whoWhatWhereHowMany.howMany must be an object.");
    if (isObject(section.howMany)) {
      addError(errors, isNumber(section.howMany.unaccountedFor), "whoWhatWhereHowMany.howMany.unaccountedFor must be a finite number.");
      addError(errors, isNumber(section.howMany.needingHelp), "whoWhatWhereHowMany.howMany.needingHelp must be a finite number.");
      addError(errors, isNumber(section.howMany.needingHelpContacted), "whoWhatWhereHowMany.howMany.needingHelpContacted must be a finite number.");
    }
  }

  addError(errors, isObject(payload.confidence), "confidence must be an object.");
  if (isObject(payload.confidence)) {
    addError(errors, ["potential", "reported", "confirmed"].includes(payload.confidence.state), "confidence.state must be one of potential/reported/confirmed.");
    addError(errors, isObject(payload.confidence.sourceMix), "confidence.sourceMix must be an object.");
    if (isObject(payload.confidence.sourceMix)) {
      addError(errors, isNumber(payload.confidence.sourceMix.hazard_inferred), "confidence.sourceMix.hazard_inferred must be a finite number.");
      addError(errors, isNumber(payload.confidence.sourceMix.sitrep_confirmed), "confidence.sourceMix.sitrep_confirmed must be a finite number.");
      addError(errors, isNumber(payload.confidence.sourceMix.everbridge_confirmed), "confidence.sourceMix.everbridge_confirmed must be a finite number.");
    }
  }

  addError(errors, isObject(payload.heatMap), "heatMap must be an object.");
  if (isObject(payload.heatMap)) {
    addError(errors, ["unaccountedFor", "needingHelp", "needingHelpContacted"].includes(payload.heatMap.metric), "heatMap.metric must be one of unaccountedFor/needingHelp/needingHelpContacted.");

    addError(errors, Array.isArray(payload.heatMap.buckets), "heatMap.buckets must be an array.");
    if (Array.isArray(payload.heatMap.buckets)) {
      payload.heatMap.buckets.forEach((bucket, index) => validateBucket(errors, bucket, index));
    }

    addError(errors, Array.isArray(payload.heatMap.districtValues), "heatMap.districtValues must be an array.");
    if (Array.isArray(payload.heatMap.districtValues)) {
      payload.heatMap.districtValues.forEach((row, index) => validateDistrictValue(errors, row, index));
    }
  }

  addError(errors, Array.isArray(payload.districtDetails), "districtDetails must be an array.");
  if (Array.isArray(payload.districtDetails)) {
    payload.districtDetails.forEach((row, index) => validateDistrictDetail(errors, row, index));
  }

  addError(errors, isObject(payload.deduplication), "deduplication must be an object.");
  if (isObject(payload.deduplication)) {
    addError(errors, typeof payload.deduplication.overlapDeconflicted === "boolean", "deduplication.overlapDeconflicted must be boolean.");
    addError(errors, typeof payload.deduplication.overlapMethod === "string" && payload.deduplication.overlapMethod.trim(), "deduplication.overlapMethod must be a non-empty string.");
    addError(errors, ["low", "medium", "high"].includes(payload.deduplication.doubleCountRisk), "deduplication.doubleCountRisk must be one of low/medium/high.");
  }

  return errors;
}

function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: node tools/validateLeadershipContract.js <payload-json-file>");
    process.exit(2);
  }

  const payloadPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(payloadPath)) {
    console.error(`File not found: ${payloadPath}`);
    process.exit(2);
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  } catch (error) {
    console.error(`Failed to parse JSON file: ${error.message}`);
    process.exit(2);
  }

  const errors = validatePayload(payload);
  if (errors.length > 0) {
    console.error(`Leadership contract validation failed with ${errors.length} issue(s):`);
    errors.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }

  console.log("Leadership contract validation passed.");
}

main();
