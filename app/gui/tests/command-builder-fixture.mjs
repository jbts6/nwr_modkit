import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

export class CommandBuilderFixtureError extends Error {
  constructor(message) {
    super(message);
    this.name = "CommandBuilderFixtureError";
  }
}

export function loadBridgeCommandNamespace(sourcePath) {
  const source = fs.readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 }
  });
  const sandbox = {};
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  if (!sandbox.NwrGuiBridgeCommands) {
    throw new CommandBuilderFixtureError("NwrGuiBridgeCommands namespace was not created");
  }
  return sandbox.NwrGuiBridgeCommands;
}

export function sampleBridgeCommands(commands) {
  return [
    commands.ping(), commands.runtimeInspect("SceneManager"), commands.runtimeSearch("gold"),
    commands.dataDump(["Actors"], "../.omo/evidence/test-dump"), commands.trainerOptionsGet(),
    commands.trainerHooksInfo(),
    commands.trainerOptionsSet({
      expRate: 2,
      goldRate: 2,
      dropRate: 2,
      noSkillCost: true,
      oneHitKill: false,
      invincible: false
    }),
    commands.goldSet(10), commands.goldAdd(5),
    commands.variableSet(1, "x"), commands.switchSet(2, true),
    commands.itemAdd("item", 3, 4), commands.itemAdd("weapon", 1, 1), commands.itemAdd("armor", 1, 1),
    commands.actorUnlock(1), commands.actorAdd(1), commands.actorRemove(1), commands.actorRecover(1),
    commands.actorNameSet(1, "Hero"), commands.actorLevelSet(1, 9),
    commands.actorExpAdd(1, 100), commands.actorVitalsSet(1, 50, 30, 10), commands.actorParamAdd(1, 2, 3),
    commands.actorJpAdd(1, 25), commands.actorAllocationPointsAdd(1, 2),
    commands.actorSkillLearn(1, 7), commands.actorSkillForget(1, 7),
    commands.battleKillEnemies(), commands.battleEscape(),
    commands.partyRecover(), commands.prisonRepair(), commands.mapCurrent(), commands.mapTransfer(1, 2, 3, 2, 0),
    commands.commonEventRun(1), commands.save(1), commands.titleRefresh()
  ];
}
