import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

class FeatureAuditPolicyContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "FeatureAuditPolicyContractError";
  }
}

const require = createRequire(import.meta.url);
const ts = require("typescript");

function assert(condition, message) {
  if (!condition) throw new FeatureAuditPolicyContractError(message);
}

function loadAuditNamespace(appDir) {
  const sourcePath = path.join(appDir, "src", "feature-audit-policy.ts");
  if (!fs.existsSync(sourcePath)) throw new FeatureAuditPolicyContractError(`policy source missing: ${sourcePath}`);
  const source = fs.readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 }
  });
  const sandbox = {};
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  assert(sandbox.NwrGuiFeatureAudit, "NwrGuiFeatureAudit namespace was not created");
  return sandbox.NwrGuiFeatureAudit;
}

function evidenceRows(appDir) {
  const rootDir = path.resolve(appDir, "..", "..", "..");
  const evidencePath = path.join(rootDir, ".omo", "evidence", "runtime-gate-feature-audit.json");
  if (!fs.existsSync(evidencePath)) throw new FeatureAuditPolicyContractError(`A1 evidence missing: ${evidencePath}`);
  return JSON.parse(fs.readFileSync(evidencePath, "utf8"));
}

function assertPolicySmoke(audit) {
  const safePanel = { tab: "catalog", sectionText: "item" };
  const guardedPanel = { tab: "debug", sectionText: "command" };
  const safePolicy = audit.policyForPanel(safePanel);
  const guardedPolicy = audit.policyForPanel(guardedPanel);
  assert(safePolicy?.classification === "keep", "catalog item panel should remain visible from A1 policy");
  assert(audit.panelIsVisible(safePanel), "keep panel should be visible");
  assert(guardedPolicy?.classification === "disable-guard", "custom command panel should carry A1 guard classification");
  assert(guardedPolicy.eventIds.length || guardedPolicy.evidenceCommands.length, "guarded policy should keep A1 evidence");
  assert(audit.panelControlId(guardedPanel) === "panel:debug:command", "panel control id should match A1 row format");
}

function assertEvidenceParity(audit, rows) {
  const eventIds = new Set(rows.flatMap((row) => row.eventIds || []));
  const panelRows = new Map(
    rows
      .filter((row) => String(row.controlId || "").startsWith("panel:"))
      .map((row) => [String(row.controlId), row])
  );
  for (const policy of audit.PANEL_POLICIES) {
    const row = panelRows.get(policy.controlId);
    assert(row, `A1 panel row missing for ${policy.controlId}`);
    assert(row.classification === policy.classification, `${policy.controlId} classification drifted`);
    const rowEvidence = [...(row.evidenceCommands || []), ...(row.eventIds || [])];
    assert(rowEvidence.length > 0, `${policy.controlId} should retain A1 evidence`);
    if (policy.classification !== "keep") {
      assert(policy.eventIds.length > 0, `${policy.controlId} should map to live A1 event evidence`);
      for (const eventId of policy.eventIds) {
        assert(eventIds.has(eventId), `${policy.controlId} references unknown A1 event ${eventId}`);
      }
    }
  }
}

class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  toggle(name, force) {
    if (force) {
      this.names.add(name);
      return true;
    }
    this.names.delete(name);
    return false;
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor() {
    this.dataset = {};
    this.attributes = new Map();
    this.disabled = false;
    this.classList = new FakeClassList();
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

function assertGuardApplication(audit) {
  const guardedPolicy = audit.policyForPanel({ tab: "debug", sectionText: "command" });
  const safePolicy = audit.policyForPanel({ tab: "catalog", sectionText: "item" });
  const panel = new FakeElement();
  const control = new FakeElement();
  audit.applyPanelAuditState(panel, [control], guardedPolicy);
  assert(panel.dataset.auditGuarded === "true", "guarded panel should record audit guard state");
  assert(panel.classList.contains("audit-guarded"), "guarded panel should receive audit class");
  assert(panel.attributes.get("aria-disabled") === "true", "guarded panel should expose aria-disabled");
  assert(control.disabled === true, "guarded policy should disable contained controls");
  assert(control.dataset.auditDisabledByPolicy === "true", "guarded control should record policy disable");
  audit.applyPanelAuditState(panel, [control], safePolicy);
  assert(panel.dataset.auditGuarded === "false", "safe policy should clear guard state");
  assert(!panel.classList.contains("audit-guarded"), "safe policy should remove audit class");
  assert(control.disabled === false, "safe policy should restore controls disabled by policy");
}

function run() {
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const audit = loadAuditNamespace(appDir);
  assertPolicySmoke(audit);
  assertEvidenceParity(audit, evidenceRows(appDir));
  assertGuardApplication(audit);
  console.log(`featureAuditPolicy: ${audit.PANEL_POLICIES.length} panel policies matched A1 rows`);
}

try {
  run();
} catch (error) {
  if (error instanceof FeatureAuditPolicyContractError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
