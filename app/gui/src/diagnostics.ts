namespace NwrGuiDiagnostics {
  export type DiagnosticId =
    | "ping"
    | "runtime.inspect"
    | "runtime.search"
    | "trainer.options.get"
    | "trainer.hooks.info"
    | "data.dump"
    | "map.current";

  export type DiagnosticDefinition = {
    readonly id: DiagnosticId;
    readonly label: string;
    readonly commandType: string;
    readonly a1ControlId: string;
    readonly mutates: false;
  };

  export const DIAGNOSTICS = [
    diagnostic("ping", "Ping", "ping"),
    diagnostic("runtime.inspect", "Runtime Inspect", "runtime.inspect"),
    diagnostic("runtime.search", "Runtime Search", "runtime.search"),
    diagnostic("trainer.options.get", "Trainer Options", "trainer.options.get"),
    diagnostic("trainer.hooks.info", "Trainer Hooks", "trainer.hooks.info"),
    diagnostic("data.dump", "Data Dump", "data.dump"),
    diagnostic("map.current", "Current Map", "map.current")
  ] satisfies readonly DiagnosticDefinition[];

  export function commandForDiagnostic(id: DiagnosticId): NwrGuiBridgeCommands.BridgeCommand {
    switch (id) {
      case "ping":
        return NwrGuiBridgeCommands.ping();
      case "runtime.inspect":
        return NwrGuiBridgeCommands.runtimeInspect("SceneManager");
      case "runtime.search":
        return NwrGuiBridgeCommands.runtimeSearch("gold map save actor item switch variable");
      case "trainer.options.get":
        return NwrGuiBridgeCommands.trainerOptionsGet();
      case "trainer.hooks.info":
        return NwrGuiBridgeCommands.trainerHooksInfo();
      case "data.dump":
        return NwrGuiBridgeCommands.dataDump(
          ["Actors", "Skills", "Items", "CommonEvents", "System", "MapInfos", "Enemies", "Troops"],
          "../.omo/evidence/gui-diagnostics-dump"
        );
      case "map.current":
        return NwrGuiBridgeCommands.mapCurrent();
      default:
        return assertNever(id);
    }
  }

  export function diagnosticById(id: string): DiagnosticDefinition | null {
    return DIAGNOSTICS.find((definition) => definition.id === id) || null;
  }

  function diagnostic(id: DiagnosticId, label: string, commandType: string): DiagnosticDefinition {
    return {
      id,
      label,
      commandType,
      a1ControlId: `candidate:${commandType}`,
      mutates: false
    };
  }

  function assertNever(value: never): never {
    throw new Error(`Unhandled diagnostic ${value}`);
  }
}
