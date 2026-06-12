namespace NwrGuiCommandGuardrails {
  export type ActionGuardrail = {
    readonly controlId: string;
    readonly label: string;
    readonly commandType: string;
    readonly classification: NwrGuiFeatureAudit.FeatureClassification;
    readonly evidenceCommands: readonly string[];
    readonly eventIds: readonly string[];
  };

  const PING_EVENTS = ["a1-live-loaded-1781195358727-0"] as const;
  const DATA_EVENTS = ["a1-live-loaded-1781195358727-7", "a1-live-loaded-1781195358727-0"] as const;
  const HOOK_EVENTS = ["a1-live-loaded-1781195358727-3", "a1-live-loaded-1781195358727-0"] as const;
  const BATTLE_EVENTS = ["a1-live-loaded-1781195358727-3", "a1-live-loaded-1781195358727-1"] as const;
  const MAP_EVENTS = ["a1-live-loaded-1781195358727-8", "a1-live-loaded-1781195358727-0"] as const;
  const COMMON_EVENT_EVENTS = ["a1-live-loaded-1781195358727-7", "a1-live-loaded-1781195358727-2"] as const;

  export const ACTION_GUARDRAILS = [
    action("goldSetBtn", "Set gold", "gold.set", "keep", ["ping"], PING_EVENTS),
    action("goldAddBtn", "Add gold", "gold.add", "keep", ["ping"], PING_EVENTS),
    action("selector:data-gold-add", "Gold quick add buttons", "gold.add", "keep", ["ping"], PING_EVENTS),
    action("selector:data-gold-set", "Gold MAX button", "gold.set", "keep", ["ping"], PING_EVENTS),
    action("variableSetBtn", "Write variable", "variable.set", "keep", ["ping"], PING_EVENTS),
    action("switchSetBtn", "Write switch", "switch.set", "keep", ["ping"], PING_EVENTS),
    action("itemAddBtn", "Add selected item", "item.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorUnlockBtn", "Unlock actor from active catalog", "actor.unlock", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorAddBtn", "Add actor to party", "actor.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorRemoveBtn", "Remove actor", "actor.remove", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorRecoverBtn", "Recover actor", "actor.recover", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorNameBtn", "Set actor name", "actor.name.set", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorLevelBtn", "Set actor level", "actor.level.set", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorExpBtn", "Add actor EXP", "actor.exp.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorVitalsBtn", "Write actor vitals", "actor.vitals.set", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorParamBtn", "Add actor parameter", "actor.param.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorSpBtn", "Add actor SP", "actor.jp.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("actorAllocationPointsBtn", "Add actor attribute points", "actor.allocationPoints.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("skillLearnBtn", "Learn actor skill", "actor.skill.learn", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("skillForgetBtn", "Forget actor skill", "actor.skill.forget", "keep", ["data.dump", "ping"], DATA_EVENTS),
    action("ratesApplyBtn", "Apply trainer rates", "trainer.options.set", "optimize", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
    action("selector:data-rate", "Trainer rate presets", "trainer.options.set", "optimize", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
    action("noCostBtn", "Toggle no skill cost", "trainer.options.set", "disable-guard", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
    action("oneHitKillBtn", "Toggle one hit kill", "trainer.options.set", "disable-guard", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
    action("invincibleBtn", "Toggle invincible", "trainer.options.set", "disable-guard", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
    action("battleKillBtn", "Kill battle enemies", "battle.killEnemies", "disable-guard", ["trainer.hooks.info", "runtime.inspect"], BATTLE_EVENTS),
    action("battleEscapeBtn", "Battle escape", "battle.escape", "disable-guard", ["trainer.hooks.info", "runtime.inspect"], BATTLE_EVENTS),
    action("partyRecoverBtn", "Recover party", "party.recover", "keep", ["ping"], PING_EVENTS),
    action("prisonRepairBtn", "Repair prison guard risks", "prison.repair", "disable-guard", ["protocol handler inventory", "ping"], PING_EVENTS),
    action("mapTransferBtn", "Transfer map", "map.transfer", "disable-guard", ["map.current", "ping"], MAP_EVENTS),
    action("returnPositionBtn", "Return recorded position", "map.transfer", "disable-guard", ["map.current", "ping"], MAP_EVENTS),
    action("commonEventRunBtn", "Run common event", "commonEvent.run", "disable-guard", ["data.dump", "runtime.search"], COMMON_EVENT_EVENTS),
    action("saveGameBtn", "Save game", "save", "disable-guard", ["protocol handler inventory"], []),
    action("titleRefreshBtn", "Refresh title", "title.refresh", "keep", ["protocol handler inventory"], []),
    action("customSendBtn", "Send custom JSON command", "custom", "disable-guard", ["static inventory", "ping"], PING_EVENTS)
  ] satisfies readonly ActionGuardrail[];

  export function guardFor(commandType: string, controlId = ""): ActionGuardrail | null {
    const direct = controlId ? ACTION_GUARDRAILS.find((guardrail) => guardrail.controlId === controlId) : null;
    if (direct) return direct;
    return ACTION_GUARDRAILS.find((guardrail) => guardrail.commandType === commandType) || null;
  }

  export function panelGuardText(policy: NwrGuiFeatureAudit.PanelPolicy): string {
    const evidence = NwrGuiFeatureAudit.policyEvidenceText(policy);
    return `A1 ${policy.classification}: ${policy.rationale}. ${evidence}`;
  }

  function action(
    controlId: string,
    label: string,
    commandType: string,
    classification: NwrGuiFeatureAudit.FeatureClassification,
    evidenceCommands: readonly string[],
    eventIds: readonly string[]
  ): ActionGuardrail {
    return { controlId, label, commandType, classification, evidenceCommands, eventIds };
  }
}
