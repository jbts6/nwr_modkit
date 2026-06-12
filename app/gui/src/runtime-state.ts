namespace NwrGuiRuntimeState {
  export type StatusKind = "idle" | "error" | "online";

  export type RuntimeStatus = {
    readonly kind: StatusKind;
    readonly text: string;
    readonly className: string;
  };

  export type PartyMemberView = {
    readonly id: string;
    readonly name: string;
    readonly vitals: string;
  };

  export type RuntimeStateView = {
    readonly hasState: boolean;
    readonly fresh: boolean;
    readonly version: string;
    readonly versionOk: boolean;
    readonly hasParty: boolean;
    readonly status: RuntimeStatus;
    readonly bridgeText: string;
    readonly partyState: string;
    readonly goldState: unknown;
    readonly goldMetric: unknown;
    readonly saveState: string;
    readonly mapState: string;
    readonly saveFiles: readonly string[];
    readonly partyMembers: readonly PartyMemberView[];
  };

  export type StateOptions = {
    readonly expectedBridgeVersion: string;
    readonly now?: number;
  };

  type JsonRecord = { readonly [key: string]: unknown };

  export function renderState(state: unknown, options: StateOptions): RuntimeStateView {
    return stateView(state, options);
  }

  export function stateView(state: unknown, options: StateOptions): RuntimeStateView {
    const row = record(state);
    if (!row) return emptyView();

    const now = options.now == null ? Date.now() : options.now;
    const age = now - Number(row.ts || 0);
    const fresh = age >= 0 && age < 5000;
    const version = textOr(row.bridgeVersion, "?");
    const versionOk = version === options.expectedBridgeVersion;
    const hasParty = !!row.hasParty;
    const status = statusFor({ fresh, versionOk, hasParty, lastError: row.lastError });
    return {
      hasState: true,
      fresh,
      version,
      versionOk,
      hasParty,
      status,
      bridgeText: bridgeText(row, fresh, version, versionOk, options.expectedBridgeVersion),
      partyState: hasParty ? "可用" : "未就绪",
      goldState: row.gold,
      goldMetric: row.gold || 0,
      saveState: row.saveDirExists ? "已识别" : "缺失",
      mapState: mapText(record(row.currentMap)),
      saveFiles: stringArray(row.saveFiles),
      partyMembers: partyMemberViews(row.partyMembers)
    };
  }

  export function statusFor(input: {
    readonly fresh: boolean;
    readonly versionOk: boolean;
    readonly hasParty: boolean;
    readonly lastError: unknown;
  }): RuntimeStatus {
    if (!input.fresh) return status("idle", "离线");
    if (!input.versionOk) return status("error", "需重启");
    if (input.lastError) return status("error", "有错误");
    if (input.hasParty) return status("online", "已连接");
    return status("idle", "加载中");
  }

  function emptyView(): RuntimeStateView {
    return {
      hasState: false,
      fresh: false,
      version: "?",
      versionOk: false,
      hasParty: false,
      status: status("idle", "未连接"),
      bridgeText: "等待 bridge",
      partyState: "-",
      goldState: "-",
      goldMetric: 0,
      saveState: "-",
      mapState: "-",
      saveFiles: [],
      partyMembers: []
    };
  }

  function status(kind: StatusKind, text: string): RuntimeStatus {
    return { kind, text, className: `status status-${kind}` };
  }

  function bridgeText(
    state: JsonRecord,
    fresh: boolean,
    version: string,
    versionOk: boolean,
    expectedBridgeVersion: string
  ): string {
    if (!fresh) return "上次状态";
    const prefix = state.storagePatched ? "已接入" : "已注入";
    return `${prefix} v${version}${versionOk ? "" : ` -> v${expectedBridgeVersion}`}`;
  }

  function mapText(map: JsonRecord | null): string {
    if (!map || !map.mapId) return "-";
    return `${map.mapId} (${map.x ?? "-"}, ${map.y ?? "-"})`;
  }

  function partyMemberViews(value: unknown): PartyMemberView[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      const actor = record(item);
      if (!actor) return [];
      return [{
        id: textOr(actor.id, ""),
        name: textOr(actor.name, ""),
        vitals: `Lv.${textOr(actor.level, "-")} HP ${textOr(actor.hp, "-")}/${textOr(actor.mhp, "-")} MP ${textOr(actor.mp, "-")}/${textOr(actor.mmp, "-")} 职${textOr(actor.classId, "-")} SP ${textOr(actor.jp, "-")} 属性点 ${textOr(actor.allocationPoints, "-")}`
      }];
    });
  }

  function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }

  function textOr(value: unknown, fallback: string): string {
    return value == null || value === "" ? fallback : String(value);
  }

  function record(value: unknown): JsonRecord | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  }
}
