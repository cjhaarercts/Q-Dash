"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPORT_DIR = path.join("infra", "terraform", "reports");

function parseArgs(argv) {
  const args = {
    summary: null,
    hazard: null,
    drilldown: null,
    callbackLatencySeconds: 900
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--summary") {
      args.summary = argv[i + 1];
      i += 1;
    } else if (token === "--hazard") {
      args.hazard = argv[i + 1];
      i += 1;
    } else if (token === "--drilldown") {
      args.drilldown = argv[i + 1];
      i += 1;
    } else if (token === "--callback-latency-seconds") {
      args.callbackLatencySeconds = Number(argv[i + 1]);
      i += 1;
    }
  }

  return args;
}

function usage() {
  console.error("Usage: node tools/runDashboardFunctionalValidation.js --summary <file> --hazard <file> --drilldown <file> [--callback-latency-seconds <n>]");
}

function resolveAndCheck(filePathArg, label) {
  if (!filePathArg) {
    throw new Error(`Missing required argument: ${label}`);
  }
  const abs = path.resolve(process.cwd(), filePathArg);
  if (!fs.existsSync(abs)) {
    throw new Error(`${label} file not found: ${abs}`);
  }
  return abs;
}

function runNodeScript(scriptPath, payloadPath) {
  const result = spawnSync(process.execPath, [scriptPath, payloadPath], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  return {
    script: scriptPath,
    payload: payloadPath,
    exitCode: result.status === null ? 1 : result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    passed: result.status === 0
  };
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

function evaluateCallbackLatency(drilldownPayload, thresholdSeconds) {
  const rows = Array.isArray(drilldownPayload.notificationTrace)
    ? drilldownPayload.notificationTrace
    : [];

  const withLatency = rows.filter((row) => Number.isFinite(row.callbackSyncLatencySeconds));
  if (withLatency.length === 0) {
    return {
      status: "needs-manual-verification",
      details: "No notificationTrace.callbackSyncLatencySeconds values were provided."
    };
  }

  const breaches = withLatency.filter((row) => row.callbackSyncLatencySeconds > thresholdSeconds);
  if (breaches.length > 0) {
    return {
      status: "fail",
      details: `${breaches.length} trace row(s) exceeded ${thresholdSeconds}s callback latency threshold.`
    };
  }

  return {
    status: "pass",
    details: `All ${withLatency.length} trace row(s) met callback latency threshold ${thresholdSeconds}s.`
  };
}

function timestampToken(now) {
  const pad = (v) => String(v).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Dashboard Functional Validation Report");
  lines.push("");
  lines.push(`- Generated UTC: ${report.generatedAtUtc}`);
  lines.push(`- Overall status: ${report.overallStatus}`);
  lines.push("");
  lines.push("## Validator Results");
  lines.push("");
  lines.push("| Validator | Status | Payload |");
  lines.push("| --- | --- | --- |");
  report.validatorResults.forEach((v) => {
    lines.push(`| ${v.name} | ${v.passed ? "pass" : "fail"} | ${v.payload} |`);
  });
  lines.push("");
  lines.push("## Acceptance Checks");
  lines.push("");
  lines.push("| Check | Status | Details |");
  lines.push("| --- | --- | --- |");
  report.acceptanceChecks.forEach((c) => {
    lines.push(`| ${c.name} | ${c.status} | ${c.details} |`);
  });
  lines.push("");
  lines.push("## Defects And Open Items");
  lines.push("");
  if (report.defects.length === 0) {
    lines.push("- None");
  } else {
    report.defects.forEach((d) => lines.push(`- ${d}`));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.summary || !args.hazard || !args.drilldown) {
    usage();
    process.exit(2);
  }
  if (!Number.isFinite(args.callbackLatencySeconds) || args.callbackLatencySeconds < 0) {
    console.error("--callback-latency-seconds must be a non-negative number.");
    process.exit(2);
  }

  let summaryPath;
  let hazardPath;
  let drilldownPath;
  try {
    summaryPath = resolveAndCheck(args.summary, "--summary");
    hazardPath = resolveAndCheck(args.hazard, "--hazard");
    drilldownPath = resolveAndCheck(args.drilldown, "--drilldown");
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  const validators = [
    {
      name: "contract-summary",
      script: path.join("tools", "validateLeadershipContract.js"),
      payload: summaryPath
    },
    {
      name: "summary-cards",
      script: path.join("tools", "validateSummaryCards.js"),
      payload: summaryPath
    },
    {
      name: "heat-map",
      script: path.join("tools", "validateHeatMap.js"),
      payload: summaryPath
    },
    {
      name: "contract-hazard",
      script: path.join("tools", "validateLeadershipContract.js"),
      payload: hazardPath
    },
    {
      name: "hazard-comparison",
      script: path.join("tools", "validateHazardComparison.js"),
      payload: hazardPath
    },
    {
      name: "contract-drilldown",
      script: path.join("tools", "validateLeadershipContract.js"),
      payload: drilldownPath
    },
    {
      name: "drilldown-trace",
      script: path.join("tools", "validateDrilldownTrace.js"),
      payload: drilldownPath
    }
  ];

  const validatorResults = validators.map((v) => {
    const out = runNodeScript(v.script, v.payload);
    return {
      name: v.name,
      payload: path.relative(process.cwd(), v.payload).replace(/\\/g, "/"),
      passed: out.passed,
      exitCode: out.exitCode,
      stdout: out.stdout.trim(),
      stderr: out.stderr.trim()
    };
  });

  const byName = new Map(validatorResults.map((v) => [v.name, v]));
  const drilldownJson = readJson(drilldownPath);
  const latency = evaluateCallbackLatency(drilldownJson, args.callbackLatencySeconds);

  const acceptanceChecks = [
    {
      name: "Event totals reconcile with district totals after deconfliction",
      status: byName.get("summary-cards")?.passed ? "pass" : "fail",
      details: byName.get("summary-cards")?.passed
        ? "Summary reconciliation validator passed."
        : "Summary reconciliation validator failed."
    },
    {
      name: "Multi-hazard totals stay within raw sums unless overlap warning rules apply",
      status: byName.get("hazard-comparison")?.passed ? "pass" : "fail",
      details: byName.get("hazard-comparison")?.passed
        ? "Hazard comparison validator passed."
        : "Hazard comparison validator failed."
    },
    {
      name: "Callback-driven Everbridge updates appear in drill-down within expected latency",
      status: latency.status,
      details: latency.details
    },
    {
      name: "Drill-down and trace linkage consistency",
      status: byName.get("drilldown-trace")?.passed ? "pass" : "fail",
      details: byName.get("drilldown-trace")?.passed
        ? "Drill-down and trace validator passed."
        : "Drill-down and trace validator failed."
    }
  ];

  const defects = [];
  validatorResults.forEach((v) => {
    if (!v.passed) {
      defects.push(`Validator failed: ${v.name}`);
      if (v.stderr) {
        defects.push(`${v.name} stderr: ${v.stderr}`);
      }
    }
  });
  acceptanceChecks.forEach((c) => {
    if (c.status === "fail") {
      defects.push(`Acceptance check failed: ${c.name}`);
    }
    if (c.status === "needs-manual-verification") {
      defects.push(`Open item: ${c.name} (${c.details})`);
    }
  });

  const now = new Date();
  const generatedAtUtc = now.toISOString();
  const token = timestampToken(now);
  const report = {
    generatedAtUtc,
    overallStatus: defects.some((d) => d.startsWith("Validator failed") || d.startsWith("Acceptance check failed"))
      ? "fail"
      : "pass-with-open-items",
    inputs: {
      summary: path.relative(process.cwd(), summaryPath).replace(/\\/g, "/"),
      hazard: path.relative(process.cwd(), hazardPath).replace(/\\/g, "/"),
      drilldown: path.relative(process.cwd(), drilldownPath).replace(/\\/g, "/"),
      callbackLatencySeconds: args.callbackLatencySeconds
    },
    validatorResults,
    acceptanceChecks,
    defects
  };

  fs.mkdirSync(path.resolve(process.cwd(), REPORT_DIR), { recursive: true });
  const jsonPath = path.resolve(process.cwd(), REPORT_DIR, `dashboard-functional-validation-${token}.json`);
  const mdPath = path.resolve(process.cwd(), REPORT_DIR, `dashboard-functional-validation-${token}.md`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, toMarkdown(report), "utf8");

  console.log(`Wrote: ${path.relative(process.cwd(), jsonPath).replace(/\\/g, "/")}`);
  console.log(`Wrote: ${path.relative(process.cwd(), mdPath).replace(/\\/g, "/")}`);

  if (report.overallStatus === "fail") {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
