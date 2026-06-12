namespace NwrGuiFeatureAudit {
  export type FeatureClassification = "keep" | "delete" | "disable-guard" | "optimize" | "candidate-add";

  export type PanelPolicyTarget = {
    readonly tab: string;
    readonly sectionText: string;
  };

  export type PanelPolicy = {
    readonly controlId: string;
    readonly classification: FeatureClassification;
    readonly actionAllowed: boolean;
    readonly evidenceCommands: readonly string[];
    readonly eventIds: readonly string[];
    readonly rationale: string;
  };

  export type AuditDataset = {
    [name: string]: string | undefined;
  };

  export type AuditClassList = {
    toggle(name: string, force?: boolean): boolean;
  };

  export type AuditPanelElement = {
    readonly dataset: AuditDataset;
    readonly classList: AuditClassList;
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
  };

  export type AuditControlElement = {
    disabled: boolean;
    readonly dataset: AuditDataset;
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
  };

  export const PANEL_POLICIES = [
    keep("panel:core:gold"),
    keep("panel:misc:variable"),
    keep("panel:misc:switch"),
    keep("panel:catalog:item"),
    keep("panel:catalog:actor"),
    keep("panel:catalog:skill"),
    optimize("panel:core:prison", "live state report is read-only; repair button keeps command guardrail confirmation", ["ping"], ["a1-live-loaded-1781195358727-0"]),
    optimize("panel:world:map", "read-only lookup stays active; transfer keeps per-control guardrails", ["map.current", "ping"], ["a1-live-loaded-1781195358727-8", "a1-live-loaded-1781195358727-0"]),
    optimize("panel:world:commonEvent", "read-only lookup stays active; event run keeps per-control guardrails", ["data.dump", "runtime.search"], ["a1-live-loaded-1781195358727-7", "a1-live-loaded-1781195358727-2"]),
    optimize("panel:core:rate", "trainer option controls are live-backed; hook state remains visible in runtime status", ["trainer.hooks.info", "ping"], ["a1-live-loaded-1781195358727-3", "a1-live-loaded-1781195358727-0"]),
    optimize("panel:core:battle", "trainer toggle controls are live-backed; scene-specific battle commands keep per-control guardrails", ["trainer.hooks.info", "runtime.inspect"], ["a1-live-loaded-1781195358727-3", "a1-live-loaded-1781195358727-1"]),
    guard("panel:core:save", "save writes are intentionally guarded until an explicit save workflow is approved", ["runtime.inspect", "protocol handler inventory"], ["a1-live-loaded-1781195358727-1"]),
    guard("panel:debug:command", "custom JSON can send mutating commands; retain only with guardrails", ["ping"], ["a1-live-loaded-1781195358727-0"])
  ] satisfies readonly PanelPolicy[];

  export function panelControlId(panel: PanelPolicyTarget): string {
    return `panel:${panel.tab}:${panel.sectionText}`;
  }

  export function policyForPanel(panel: PanelPolicyTarget): PanelPolicy | null {
    const controlId = panelControlId(panel);
    return PANEL_POLICIES.find((policy) => policy.controlId === controlId) || null;
  }

  export function panelIsVisible(panel: PanelPolicyTarget): boolean {
    return policyForPanel(panel)?.classification !== "delete";
  }

  export function policyEvidenceText(policy: PanelPolicy | null): string {
    if (!policy) return "";
    const commandText = policy.evidenceCommands.join(",");
    const eventText = policy.eventIds.join(",");
    return eventText ? `${commandText}; events=${eventText}` : commandText;
  }

  export function applyPanelAuditState(
    panel: AuditPanelElement,
    controls: readonly AuditControlElement[],
    policy: PanelPolicy | null
  ): void {
    if (!policy) {
      clearPanelAudit(panel);
      setControlsGuarded(controls, false);
      return;
    }
    const guarded = !policy.actionAllowed;
    panel.dataset.auditControlId = policy.controlId;
    panel.dataset.auditClassification = policy.classification;
    panel.dataset.auditActionAllowed = policy.actionAllowed ? "true" : "false";
    panel.dataset.auditEvidence = policyEvidenceText(policy);
    panel.dataset.auditGuarded = guarded ? "true" : "false";
    panel.classList.toggle("audit-guarded", guarded);
    if (guarded) panel.setAttribute("aria-disabled", "true");
    else panel.removeAttribute("aria-disabled");
    setControlsGuarded(controls, guarded);
  }

  function keep(controlId: string): PanelPolicy {
    return {
      controlId,
      classification: "keep",
      actionAllowed: true,
      evidenceCommands: ["static inventory"],
      eventIds: [],
      rationale: "static GUI panel backed by inventory or local controls"
    };
  }

  function guard(
    controlId: string,
    rationale = "panel contains scene-dependent or mutating actions",
    evidenceCommands: readonly string[] = ["static inventory"],
    eventIds: readonly string[] = []
  ): PanelPolicy {
    return {
      controlId,
      classification: "disable-guard",
      actionAllowed: false,
      evidenceCommands,
      eventIds,
      rationale
    };
  }

  function optimize(
    controlId: string,
    rationale: string,
    evidenceCommands: readonly string[],
    eventIds: readonly string[]
  ): PanelPolicy {
    return {
      controlId,
      classification: "optimize",
      actionAllowed: true,
      evidenceCommands,
      eventIds,
      rationale
    };
  }

  function clearPanelAudit(panel: AuditPanelElement): void {
    delete panel.dataset.auditControlId;
    delete panel.dataset.auditClassification;
    delete panel.dataset.auditActionAllowed;
    delete panel.dataset.auditEvidence;
    delete panel.dataset.auditGuarded;
    panel.classList.toggle("audit-guarded", false);
    panel.removeAttribute("aria-disabled");
  }

  function setControlsGuarded(controls: readonly AuditControlElement[], guarded: boolean): void {
    controls.forEach((control) => {
      if (guarded) {
        control.disabled = true;
        control.dataset.auditDisabledByPolicy = "true";
        control.setAttribute("aria-disabled", "true");
        return;
      }
      if (control.dataset.auditDisabledByPolicy !== "true") return;
      control.disabled = false;
      delete control.dataset.auditDisabledByPolicy;
      control.removeAttribute("aria-disabled");
    });
  }
}
