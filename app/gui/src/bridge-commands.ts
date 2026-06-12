namespace NwrGuiBridgeCommands {
  export type OptionPatch = { readonly [key: string]: unknown };

  export type BridgeCommand =
    | { readonly type: "ping" }
    | { readonly type: "runtime.inspect"; readonly path: string }
    | { readonly type: "runtime.search"; readonly keywords: readonly string[] }
    | { readonly type: "data.dump"; readonly names: readonly string[]; readonly outputDir: string }
    | { readonly type: "trainer.options.get" }
    | { readonly type: "trainer.hooks.info" }
    | { readonly type: "trainer.options.set"; readonly options: OptionPatch }
    | { readonly type: "gold.set"; readonly value: number }
    | { readonly type: "gold.add"; readonly amount: number }
    | { readonly type: "variable.set"; readonly id: number; readonly value: unknown }
    | { readonly type: "switch.set"; readonly id: number; readonly value: boolean }
    | { readonly type: "item.add"; readonly kind: string; readonly id: number; readonly amount: number }
    | { readonly type: "actor.unlock"; readonly id: number }
    | { readonly type: "actor.add"; readonly id: number }
    | { readonly type: "actor.remove"; readonly id: number }
    | { readonly type: "actor.recover"; readonly id: number }
    | { readonly type: "actor.name.set"; readonly id: number; readonly name: string }
    | { readonly type: "actor.level.set"; readonly id: number; readonly level: number }
    | { readonly type: "actor.exp.add"; readonly id: number; readonly amount: number }
    | { readonly type: "actor.vitals.set"; readonly id: number; readonly hp?: number; readonly mp?: number; readonly tp?: number }
    | { readonly type: "actor.param.add"; readonly id: number; readonly paramId: number; readonly value: number }
    | { readonly type: "actor.jp.add"; readonly id: number; readonly amount: number; readonly classId?: number }
    | { readonly type: "actor.allocationPoints.add"; readonly id: number; readonly amount: number; readonly classId?: number }
    | { readonly type: "actor.skill.learn"; readonly id: number; readonly skillId: number }
    | { readonly type: "actor.skill.forget"; readonly id: number; readonly skillId: number }
    | { readonly type: "battle.killEnemies" }
    | { readonly type: "battle.escape" }
    | { readonly type: "party.recover" }
    | { readonly type: "prison.repair" }
    | { readonly type: "map.current" }
    | { readonly type: "map.transfer"; readonly mapId: number; readonly x: number; readonly y: number; readonly direction: number; readonly fade: number }
    | { readonly type: "commonEvent.run"; readonly id: number }
    | { readonly type: "save"; readonly id: number }
    | { readonly type: "title.refresh" };

  export const ping = (): BridgeCommand => ({ type: "ping" });
  export const runtimeInspect = (targetPath: string): BridgeCommand => ({ type: "runtime.inspect", path: targetPath });
  export const runtimeSearch = (query: string | readonly string[]): BridgeCommand => ({
    type: "runtime.search",
    keywords: Array.isArray(query)
      ? query.map((keyword) => String(keyword).trim()).filter(Boolean)
      : String(query || "").split(/\s+/).map((keyword) => keyword.trim()).filter(Boolean)
  });
  export const dataDump = (names: readonly string[], outputDir: string): BridgeCommand => ({ type: "data.dump", names, outputDir });
  export const trainerOptionsGet = (): BridgeCommand => ({ type: "trainer.options.get" });
  export const trainerHooksInfo = (): BridgeCommand => ({ type: "trainer.hooks.info" });
  export const trainerOptionsSet = (options: OptionPatch): BridgeCommand => ({ type: "trainer.options.set", options });
  export const goldSet = (value: number): BridgeCommand => ({ type: "gold.set", value });
  export const goldAdd = (amount: number): BridgeCommand => ({ type: "gold.add", amount });
  export const variableSet = (id: number, value: unknown): BridgeCommand => ({ type: "variable.set", id, value });
  export const switchSet = (id: number, value: boolean): BridgeCommand => ({ type: "switch.set", id, value });
  export const itemAdd = (kind: string, id: number, amount: number): BridgeCommand => ({ type: "item.add", kind, id, amount });
  export const actorUnlock = (id: number): BridgeCommand => ({ type: "actor.unlock", id });
  export const actorAdd = (id: number): BridgeCommand => ({ type: "actor.add", id });
  export const actorRemove = (id: number): BridgeCommand => ({ type: "actor.remove", id });
  export const actorRecover = (id: number): BridgeCommand => ({ type: "actor.recover", id });
  export const actorNameSet = (id: number, name: string): BridgeCommand => ({ type: "actor.name.set", id, name });
  export const actorLevelSet = (id: number, level: number): BridgeCommand => ({ type: "actor.level.set", id, level });
  export const actorExpAdd = (id: number, amount: number): BridgeCommand => ({ type: "actor.exp.add", id, amount });
  export const actorVitalsSet = (id: number, hp?: number, mp?: number, tp?: number): BridgeCommand => ({ type: "actor.vitals.set", id, hp, mp, tp });
  export const actorParamAdd = (id: number, paramId: number, value: number): BridgeCommand => ({ type: "actor.param.add", id, paramId, value });
  export const actorJpAdd = (id: number, amount: number, classId?: number): BridgeCommand => ({ type: "actor.jp.add", id, amount, classId });
  export const actorAllocationPointsAdd = (id: number, amount: number, classId?: number): BridgeCommand => ({
    type: "actor.allocationPoints.add",
    id,
    amount,
    classId
  });
  export const actorSkillLearn = (id: number, skillId: number): BridgeCommand => ({ type: "actor.skill.learn", id, skillId });
  export const actorSkillForget = (id: number, skillId: number): BridgeCommand => ({ type: "actor.skill.forget", id, skillId });
  export const battleKillEnemies = (): BridgeCommand => ({ type: "battle.killEnemies" });
  export const battleEscape = (): BridgeCommand => ({ type: "battle.escape" });
  export const partyRecover = (): BridgeCommand => ({ type: "party.recover" });
  export const prisonRepair = (): BridgeCommand => ({ type: "prison.repair" });
  export const mapCurrent = (): BridgeCommand => ({ type: "map.current" });
  export const mapTransfer = (mapId: number, x: number, y: number, direction: number, fade: number): BridgeCommand => ({ type: "map.transfer", mapId, x, y, direction, fade });
  export const commonEventRun = (id: number): BridgeCommand => ({ type: "commonEvent.run", id });
  export const save = (id: number): BridgeCommand => ({ type: "save", id });
  export const titleRefresh = (): BridgeCommand => ({ type: "title.refresh" });
}
