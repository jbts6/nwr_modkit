import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBridgeCommandNamespace, sampleBridgeCommands } from "./command-builder-fixture.mjs";

class CommandBuilderError extends Error {
  constructor(message) {
    super(message);
    this.name = "CommandBuilderError";
  }
}

const HANDLER_PATTERN = /\btype\s*===\s*["']([^"']+)["']/g;
const REQUIRED_USER_COMMAND_TYPES = [
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
  "actor.jp.add",
  "actor.allocationPoints.add",
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

function parseOptions(argv) {
  const options = { quiet: false, extraExpectedType: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (arg === "--expect-type") {
      const value = argv[index + 1];
      if (!value) throw new CommandBuilderError("--expect-type requires a value");
      options.extraExpectedType = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--expect-type=")) {
      const value = arg.slice("--expect-type=".length);
      if (!value) throw new CommandBuilderError("--expect-type requires a value");
      options.extraExpectedType = value;
      continue;
    }
    throw new CommandBuilderError(`unknown argument: ${arg}`);
  }
  return options;
}

function collectHandlers(sourceText) {
  return new Set(Array.from(sourceText.matchAll(HANDLER_PATTERN)).map((match) => match[1]).filter(Boolean));
}

function assertItemAddKindCoverage(samples) {
  const itemAddKinds = new Set(
    samples
      .filter((command) => command.type === "item.add")
      .map((command) => String(command.kind || ""))
  );
  const missingKinds = REQUIRED_ITEM_ADD_KINDS.filter((kind) => !itemAddKinds.has(kind));
  if (missingKinds.length > 0) {
    throw new CommandBuilderError(`item.add samples missing kinds: ${missingKinds.join(", ")}`);
  }
}

function assertTrainerOptionsCoverage(samples) {
  const optionKeys = new Set(
    samples
      .filter((command) => command.type === "trainer.options.set")
      .flatMap((command) => Object.keys(command.options || {}))
  );
  const missingKeys = REQUIRED_TRAINER_OPTION_KEYS.filter((key) => !optionKeys.has(key));
  if (missingKeys.length > 0) {
    throw new CommandBuilderError(`trainer.options.set samples missing option keys: ${missingKeys.join(", ")}`);
  }
}

function assertRuntimeSearchSchema(samples) {
  const sample = samples.find((command) => command.type === "runtime.search");
  if (!sample) throw new CommandBuilderError("runtime.search sample missing");
  if ("query" in sample) {
    throw new CommandBuilderError("runtime.search builder must not emit legacy query payload");
  }
  if (!Array.isArray(sample.keywords) || sample.keywords.length === 0) {
    throw new CommandBuilderError("runtime.search builder must emit non-empty keywords array");
  }
}

function run() {
  const options = parseOptions(process.argv.slice(2));
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(testsDir, "..");
  const modkitDir = path.resolve(appDir, "..", "..");
  const commands = loadBridgeCommandNamespace(path.join(appDir, "src", "bridge-commands.ts"));
  const samples = sampleBridgeCommands(commands);
  const handlers = collectHandlers(fs.readFileSync(path.join(modkitDir, "runtime", "bridge", "page-bridge.js"), "utf8"));
  const sampleTypes = new Set(samples.map((command) => command.type));
  assertRuntimeSearchSchema(samples);
  assertItemAddKindCoverage(samples);
  assertTrainerOptionsCoverage(samples);
  const expectedBuilderTypes = new Set(REQUIRED_USER_COMMAND_TYPES);
  if (options.extraExpectedType) expectedBuilderTypes.add(options.extraExpectedType);
  const missingBuilderTypes = Array.from(expectedBuilderTypes).filter((type) => !sampleTypes.has(type)).sort();
  if (missingBuilderTypes.length > 0) throw new CommandBuilderError(`required command types missing builders: ${missingBuilderTypes.join(", ")}`);
  const missing = Array.from(sampleTypes).filter((type) => !handlers.has(type)).sort();
  if (missing.length > 0) throw new CommandBuilderError(`builder command types missing bridge handlers: ${missing.join(", ")}`);
  if (!options.quiet) {
    console.log("Bridge command builders");
    console.log(`sampleCount: ${samples.length}`);
    console.log(`uniqueTypes: ${sampleTypes.size}`);
    for (const command of samples) console.log(`${command.type}: ${JSON.stringify(command)}`);
  }
}

try {
  run();
} catch (error) {
  if (error instanceof CommandBuilderError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
