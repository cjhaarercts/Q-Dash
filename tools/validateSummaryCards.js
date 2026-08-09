"use strict";

const fs = require("fs");
const path = require("path");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function usage() {
  console.error("Usage: node tools/validateSummaryCards.js <payload-json-file> [--allow-provisional]");
}

function loadPayload(fileArg) {
  const payloadPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`File not found: ${payloadPath}`);
  }
  return JSON.parse(fs.readFileSync(payloadPath, "utf8"));
}

function ensureObject(errors, value, label) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object.`);
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

function getCardValues(payload) {
  const hazards = payload?.whoWhatWhereHowMany?.what?.hazards;
  const districts = payload?.whoWhatWhereHowMany?.where?.districts;
  const overlapDistricts = payload?.whoWhatWhereHowMany?.where?.overlapDistricts;

  return {
    potentiallyAffectedMembers: payload?.whoWhatWhereHowMany?.who?.potentiallyAffectedMembers,
    reportedMembers: payload?.whoWhatWhereHowMany?.who?.reportedMembers,
    activeHazardsCount: Array.isArray(hazards) ? hazards.length : null,
    activeNotifications: payload?.whoWhatWhereHowMany?.what?.activeNotifications,
    impactedDistrictsCount: Array.isArray(districts) ? districts.length : null,
    overlapDistrictsCount: Array.isArray(overlapDistricts) ? overlapDistricts.length : null,
    unaccountedFor: payload?.whoWhatWhereHowMany?.howMany?.unaccountedFor,
    needingHelp: payload?.whoWhatWhereHowMany?.howMany?.needingHelp,
    needingHelpContacted: payload?.whoWhatWhereHowMany?.howMany?.needingHelpContacted,
    confidenceState: payload?.confidence?.state,
    generatedAtUtc: payload?.generatedAtUtc
  };
}

function aggregateDistrictCounts(districtDetails) {
  return districtDetails.reduce(
    (acc, row) => {
      const counts = row && row.counts ? row.counts : {};
      acc.unaccountedFor += Number.isFinite(counts.unaccountedFor) ? counts.unaccountedFor : 0;
      acc.needingHelp += Number.isFinite(counts.needingHelp) ? counts.needingHelp : 0;
      acc.needingHelpContacted += Number.isFinite(counts.needingHelpContacted) ? counts.needingHelpContacted : 0;
      return acc;
    },
    { unaccountedFor: 0, needingHelp: 0, needingHelpContacted: 0 }
  );
}

function main() {
  const payloadArg = process.argv[2];
  const allowProvisional = process.argv.includes("--allow-provisional");

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

  ensureObject(errors, payload.whoWhatWhereHowMany, "whoWhatWhereHowMany");
  ensureObject(errors, payload.whoWhatWhereHowMany?.who, "whoWhatWhereHowMany.who");
  ensureObject(errors, payload.whoWhatWhereHowMany?.what, "whoWhatWhereHowMany.what");
  ensureObject(errors, payload.whoWhatWhereHowMany?.where, "whoWhatWhereHowMany.where");
  ensureObject(errors, payload.whoWhatWhereHowMany?.howMany, "whoWhatWhereHowMany.howMany");
  ensureObject(errors, payload.confidence, "confidence");

  const districtDetails = Array.isArray(payload.districtDetails) ? payload.districtDetails : null;
  if (!districtDetails) {
    errors.push("districtDetails must be an array.");
  }

  const cards = getCardValues(payload);

  ensureNumber(errors, cards.potentiallyAffectedMembers, "Card C1 potentiallyAffectedMembers");
  ensureNumber(errors, cards.reportedMembers, "Card C2 reportedMembers");
  ensureNumber(errors, cards.activeHazardsCount, "Card C3 activeHazardsCount");
  ensureNumber(errors, cards.activeNotifications, "Card C4 activeNotifications");
  ensureNumber(errors, cards.impactedDistrictsCount, "Card C5 impactedDistrictsCount");
  ensureNumber(errors, cards.overlapDistrictsCount, "Card C6 overlapDistrictsCount");
  ensureNumber(errors, cards.unaccountedFor, "Card C7 unaccountedFor");
  ensureNumber(errors, cards.needingHelp, "Card C8 needingHelp");
  ensureNumber(errors, cards.needingHelpContacted, "Card C9 needingHelpContacted");

  const confidenceAllowed = ["potential", "reported", "confirmed"];
  if (!confidenceAllowed.includes(cards.confidenceState)) {
    errors.push("Card C10 confidenceState must be one of potential/reported/confirmed.");
  }
  if (typeof cards.generatedAtUtc !== "string" || cards.generatedAtUtc.trim().length === 0) {
    errors.push("Card C11 generatedAtUtc must be a non-empty string.");
  }

  if (districtDetails) {
    const agg = aggregateDistrictCounts(districtDetails);
    const overlapDeconflicted = payload?.deduplication?.overlapDeconflicted === true;

    const mismatch =
      cards.unaccountedFor !== agg.unaccountedFor ||
      cards.needingHelp !== agg.needingHelp ||
      cards.needingHelpContacted !== agg.needingHelpContacted;

    if (overlapDeconflicted && mismatch) {
      errors.push(
        "Deconflicted reconciliation failed: summary C7-C9 totals do not equal districtDetails aggregate totals."
      );
    }

    if (!overlapDeconflicted && mismatch && !allowProvisional) {
      errors.push(
        "Provisional reconciliation mismatch detected while overlapDeconflicted=false. Re-run with --allow-provisional if this is expected."
      );
    }

    console.log("Summary card values:");
    console.log(JSON.stringify(cards, null, 2));
    console.log("District aggregate totals:");
    console.log(JSON.stringify(agg, null, 2));
    console.log(`overlapDeconflicted: ${overlapDeconflicted}`);
  }

  if (errors.length > 0) {
    console.error(`Summary card validation failed with ${errors.length} issue(s):`);
    errors.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }

  console.log("Summary card validation passed.");
}

main();
