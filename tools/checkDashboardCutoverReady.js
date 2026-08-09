"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function runGit(args) {
  const out = spawnSync("git", args, { encoding: "utf8" });
  return {
    code: out.status === null ? 1 : out.status,
    stdout: (out.stdout || "").trim(),
    stderr: (out.stderr || "").trim()
  };
}

function listCutoverFiles() {
  const reportsDir = path.resolve(process.cwd(), "infra", "terraform", "reports");
  if (!fs.existsSync(reportsDir)) {
    return [];
  }
  return fs
    .readdirSync(reportsDir)
    .filter((name) => /^dashboard-cutover-package-\d{8}\.md$/.test(name))
    .map((name) => path.join(reportsDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function findLine(text, prefix) {
  const line = text.split(/\r?\n/).find((row) => row.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

function parseEvidenceFiles(text) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.trim() === "## 8. Validation Evidence");
  if (idx < 0) {
    return [];
  }

  const evidence = [];
  for (let i = idx + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("## ")) {
      break;
    }
    if (line.startsWith("- `") && line.endsWith("`")) {
      evidence.push(line.slice(3, -1));
    }
  }
  return evidence;
}

function parseOpenItems(text) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.trim() === "## 9. Open Items");
  if (idx < 0) {
    return [];
  }

  const items = [];
  for (let i = idx + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("## ")) {
      break;
    }
    if (line.startsWith("- ")) {
      items.push(line.slice(2).trim());
    }
  }
  return items;
}

function normalizeOpenItems(items) {
  return items.filter((item) => {
    const normalized = item.toLowerCase().replace(/[.\s]+$/g, "");
    return normalized !== "none";
  });
}

function main() {
  const releaseTag = process.argv[2] || "v0.2.0";
  const issues = [];

  const cutoverFiles = listCutoverFiles();
  if (cutoverFiles.length === 0) {
    console.error("No cutover package file found under infra/terraform/reports.");
    process.exit(1);
  }

  const cutoverPath = cutoverFiles[0];
  const cutoverRel = path.relative(process.cwd(), cutoverPath).replace(/\\/g, "/");
  const cutoverText = fs.readFileSync(cutoverPath, "utf8");

  const approvedBy = findLine(cutoverText, "- Approved by: ");
  const dashboardUrl = findLine(cutoverText, "- Dashboard URL: ");

  if (!approvedBy || approvedBy.includes("pending")) {
    issues.push("Cutover approver identity is missing or still pending.");
  }
  if (!dashboardUrl || dashboardUrl.includes("pending")) {
    issues.push("Dashboard URL is missing or still pending.");
  }

  const evidenceFiles = parseEvidenceFiles(cutoverText);
  if (evidenceFiles.length === 0) {
    issues.push("No validation evidence files listed in cutover package.");
  }

  evidenceFiles.forEach((relPath) => {
    const absPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(absPath)) {
      issues.push(`Missing evidence file: ${relPath}`);
    }
  });

  const openItems = normalizeOpenItems(parseOpenItems(cutoverText));
  if (openItems.length > 0) {
    issues.push(`Cutover package still has ${openItems.length} open item(s).`);
  }

  const gitStatus = runGit(["status", "--porcelain"]);
  if (gitStatus.code !== 0) {
    issues.push(`Unable to verify git status: ${gitStatus.stderr || "unknown error"}`);
  } else if (gitStatus.stdout.length > 0) {
    issues.push("Working tree is not clean.");
  }

  const tagCheck = runGit(["tag", "--list", releaseTag]);
  if (tagCheck.code !== 0 || tagCheck.stdout !== releaseTag) {
    issues.push(`Release tag ${releaseTag} is missing.`);
  }

  const headTagCheck = runGit(["tag", "--points-at", "HEAD"]);
  if (headTagCheck.code === 0) {
    const tagsAtHead = headTagCheck.stdout.split(/\r?\n/).filter(Boolean);
    if (!tagsAtHead.includes(releaseTag)) {
      issues.push(`Release tag ${releaseTag} is not on HEAD.`);
    }
  }

  console.log(`Cutover package: ${cutoverRel}`);
  console.log(`Release tag check: ${releaseTag}`);
  console.log(`Evidence files listed: ${evidenceFiles.length}`);

  if (issues.length > 0) {
    console.error("Cutover readiness check failed:");
    issues.forEach((item) => console.error(`- ${item}`));
    process.exit(1);
  }

  console.log("Cutover readiness check passed.");
}

if (require.main === module) {
  main();
}
