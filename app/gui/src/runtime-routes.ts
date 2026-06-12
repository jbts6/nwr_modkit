namespace NwrGuiRuntimeRoutes {
  export type RouteName = "manual-bg-bridge";

  export type RouteOption = {
    readonly name: RouteName;
    readonly label: string;
    readonly default: boolean;
    readonly powershellSwitches: readonly string[];
    readonly launcher: string;
    readonly riskNote: string;
  };

  export type DiagnosticModel = {
    readonly routeName: RouteName;
    readonly label: string;
    readonly launcher: string;
    readonly switchText: string;
    readonly riskNote: string;
  };

  const ROUTES: readonly RouteOption[] = [
    {
      name: "manual-bg-bridge",
      label: "Prepare manual bridge game",
      default: true,
      powershellSwitches: ["-BgBridgeManual"],
      launcher: "launch-bg-bridge-runtime.ps1",
      riskNote: "手动 bridge：准备 runtime/game-app/start-manual-bg-bridge.cmd，然后用“打开游戏”启动生成目录。准备阶段不修改根目录 package.json 或 www 文件，也不会启动根目录 Game.exe；普通根目录 Game.exe 已运行时无法后附加。"
    }
  ];

  export function routeOptions(): readonly RouteOption[] {
    return ROUTES.slice();
  }

  export function defaultRouteName(): RouteName {
    const route = ROUTES.find((item) => item.default);
    return route ? route.name : "manual-bg-bridge";
  }

  export function normalizeRouteName(value: unknown): RouteName {
    const route = ROUTES.find((item) => item.name === value);
    return route ? route.name : defaultRouteName();
  }

  export function routeOption(name: unknown): RouteOption {
    const routeName = normalizeRouteName(name);
    const route = ROUTES.find((item) => item.name === routeName);
    return route || ROUTES[0];
  }

  export function launchArguments(baseArgs: readonly string[], name: unknown): string[] {
    return [...baseArgs, ...routeOption(name).powershellSwitches];
  }

  export function diagnosticModel(name: unknown): DiagnosticModel {
    const route = routeOption(name);
    return {
      routeName: route.name,
      label: route.label,
      launcher: route.launcher,
      switchText: route.powershellSwitches.length ? route.powershellSwitches.join(" ") : "(none)",
      riskNote: route.riskNote
    };
  }
}
