import fs from "node:fs";
import cp from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

class CliCommandPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliCommandPolicyError";
  }
}

function formatList(values) {
  return values.length === 0 ? "none" : values.join(", ");
}

const REQUIRED_CLI_COMMANDS = [
  "item.add",
  "actor.add",
  "actor.unlock",
  "actor.remove",
  "actor.recover",
  "actor.name.set",
  "actor.level.set",
  "actor.exp.add",
  "actor.vitals.set",
  "actor.param.add",
  "actor.skill.learn",
  "actor.skill.forget",
  "variable.set",
  "switch.set",
  "trainer.options.get",
  "trainer.hooks.info",
  "trainer.options.set"
];
const REQUIRED_ITEM_ADD_KINDS = ["item", "weapon", "armor"];
const REQUIRED_TRAINER_OPTION_KEYS = [
  "expRate",
  "goldRate",
  "dropRate",
  "noSkillCost",
  "oneHitKill",
  "invincible"
];

function assertNoUnsupportedHangupCommands(source) {
  const unsupported = ["hangup", "offlineHunt", "progress.enemyBook.unlock", "enemyBook", "skillRate"];
  const exposed = unsupported.filter((command) => source.includes(command));
  if (exposed.length > 0) {
    throw new CliCommandPolicyError(`trainer-send.mjs exposes retired commands or options: ${formatList(exposed)}`);
  }
}

function assertGuardedPolicy(source) {
  const requiredTerms = [
    "NORMAL_COMMAND_TYPES",
    "GUARDED_COMMAND_TYPES",
    "--allow-guarded",
    "--unsafe",
    "unsupported command without --allow-guarded"
  ];
  const missing = requiredTerms.filter((term) => !source.includes(term));
  if (missing.length > 0) {
    throw new CliCommandPolicyError(`trainer-send.mjs is missing guarded policy terms: ${formatList(missing)}`);
  }
  if (!/NORMAL_COMMAND_TYPES[\s\S]*trainer\.options\.set/.test(source)) {
    throw new CliCommandPolicyError("trainer.options.set must remain a normal reversible command");
  }
  if (!/GUARDED_COMMAND_TYPES[\s\S]*battle\.killEnemies/.test(source)) {
    throw new CliCommandPolicyError("battle.killEnemies must be guarded by default");
  }
}

function assertNoRemovedCliSurface(source) {
  const removedRoot = ["fi", "sh"].join("");
  const titleRemovedRoot = `${removedRoot[0].toUpperCase()}${removedRoot.slice(1)}`;
  const removedDomain = [removedRoot, "ing"].join("");
  const removedCommandPattern = new RegExp(`\\b${[removedDomain, ""].join("\\.")}[a-zA-Z.]+`, "gi");
  const removedRootCommandPattern = new RegExp(`\\b${removedRoot}(?:\\.[a-zA-Z.]+)?\\b`, "gi");
  const exposed = [
    ...source.matchAll(removedCommandPattern),
    ...source.matchAll(removedRootCommandPattern)
  ].map((match) => match[0]);
  if (exposed.length > 0) {
    throw new CliCommandPolicyError(`trainer-send.mjs still exposes removed commands: ${formatList([...new Set(exposed)].sort())}`);
  }
  const helpTerms = [
    [titleRemovedRoot, "ing"].join(""),
    removedRoot,
    `${removedDomain} state`,
    [removedRoot, removedDomain].join(" "),
    String.fromCharCode(0x9493),
    ["鱼", "具"].join(""),
    ["鱼", "池"].join("")
  ];
  const leakedTerms = helpTerms.filter((term) => source.includes(term));
  if (leakedTerms.length > 0) {
    throw new CliCommandPolicyError(`trainer-send.mjs help still exposes removed terms: ${formatList(leakedTerms)}`);
  }
}

function assertRemovedSurfacePolicyRejectsScopedTerms() {
  const removedRoot = ["fi", "sh"].join("");
  const titleRemovedRoot = `${removedRoot[0].toUpperCase()}${removedRoot.slice(1)}`;
  const removedDomain = [removedRoot, "ing"].join("");
  const blockedSamples = [
    `${removedRoot}.info`,
    `${titleRemovedRoot}.info`,
    removedRoot,
    titleRemovedRoot,
    `${removedDomain}.info`,
    ["鱼", "池"].join("")
  ];
  const accepted = [];
  for (const sample of blockedSamples) {
    try {
      assertNoRemovedCliSurface(sample);
      accepted.push(sample);
    } catch (error) {
      if (!(error instanceof CliCommandPolicyError)) throw error;
    }
  }
  if (accepted.length > 0) {
    throw new CliCommandPolicyError(`removed surface policy allowed scoped terms: ${formatList(accepted)}`);
  }
}

function assertRequiredCliCommands(sourceName, source) {
  const missing = REQUIRED_CLI_COMMANDS.filter((command) => !source.includes(command));
  if (missing.length > 0) {
    throw new CliCommandPolicyError(`${sourceName} is missing required commands: ${formatList(missing)}`);
  }
}

function assertItemKindHelpExamples(source) {
  const missing = REQUIRED_ITEM_ADD_KINDS.filter((kind) => !source.includes(`item.add ${kind} `));
  if (missing.length > 0) {
    throw new CliCommandPolicyError(`trainer-send.mjs --help is missing item.add kind examples: ${formatList(missing)}`);
  }
}

function assertTrainerOptionHelpExamples(source) {
  const missing = REQUIRED_TRAINER_OPTION_KEYS.filter((key) => !source.includes(`${key}=`));
  if (missing.length > 0) {
    throw new CliCommandPolicyError(`trainer-send.mjs --help is missing trainer option examples: ${formatList(missing)}`);
  }
}

function assertMalformedStateDoesNotCrash(modkitDir) {
  const statePath = path.join(modkitDir, "runtime", "bridge-state", "state.json");
  const backupPath = `${statePath}.cli-policy-backup`;
  const hadState = fs.existsSync(statePath);
  if (hadState) fs.copyFileSync(statePath, backupPath);
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, "{\"ts\":", "utf8");
    const result = cp.spawnSync(
      process.execPath,
      [path.join(modkitDir, "tools", "trainer-send.mjs"), "status"],
      { cwd: path.dirname(modkitDir), encoding: "utf8" }
    );
    if (result.status !== 0 || result.stdout.trim() !== "null") {
      throw new CliCommandPolicyError("trainer-send.mjs status must tolerate malformed bridge state JSON");
    }
  } finally {
    if (hadState) fs.copyFileSync(backupPath, statePath);
    else if (fs.existsSync(statePath)) fs.rmSync(statePath);
    if (fs.existsSync(backupPath)) fs.rmSync(backupPath);
  }
}

function assertHelpDoesNotExposeRemovedCommands(modkitDir, trainerSendPath) {
  const result = cp.spawnSync(
    process.execPath,
    [trainerSendPath, "--help"],
    { cwd: path.dirname(modkitDir), encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new CliCommandPolicyError(`trainer-send.mjs --help failed: ${result.stderr || result.stdout}`);
  }
  assertNoRemovedCliSurface(result.stdout);
  assertRequiredCliCommands("trainer-send.mjs --help", result.stdout);
  assertItemKindHelpExamples(result.stdout);
  assertTrainerOptionHelpExamples(result.stdout);
}

function run() {
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const modkitDir = path.resolve(testsDir, "..", "..", "..");
  const trainerSendPath = path.join(modkitDir, "tools", "trainer-send.mjs");
  const source = fs.readFileSync(trainerSendPath, "utf8");
  assertRemovedSurfacePolicyRejectsScopedTerms();
  assertNoUnsupportedHangupCommands(source);
  assertGuardedPolicy(source);
  assertNoRemovedCliSurface(source);
  assertRequiredCliCommands("trainer-send.mjs", source);
  assertHelpDoesNotExposeRemovedCommands(modkitDir, trainerSendPath);
  assertMalformedStateDoesNotCrash(modkitDir);
  console.log("CLI command policy excludes unsupported hangup commands and guards experimental commands");
}

try {
  run();
} catch (error) {
  if (error instanceof CliCommandPolicyError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
