namespace NwrGuiPrisonGuards {
  export type GuardSeverity = "danger" | "warning" | "ok";

  export type PrisonGuardCheck = {
    readonly id: string;
    readonly group: string;
    readonly label: string;
    readonly path: string;
    readonly value: string;
    readonly limit: string;
    readonly effect: string;
    readonly severity: GuardSeverity;
    readonly fixable: boolean;
    readonly note: string;
  };

  export type PrisonGuardReport = {
    readonly checks: readonly PrisonGuardCheck[];
    readonly hits: readonly PrisonGuardCheck[];
    readonly warnings: readonly PrisonGuardCheck[];
    readonly punishmentSwitch: boolean;
    readonly mapId: number | null;
    readonly playerX: number | null;
    readonly playerY: number | null;
  };

  export type PrisonBypassView = {
    readonly active: boolean;
    readonly stats: {
      readonly blockedSwitch520: number;
      readonly blockedDisableSave: number;
      readonly blockedTransfer695: number;
      readonly rescueCount: number;
    } | null;
  };

  export type PrisonGuardElements = {
    readonly summary: HTMLElement;
    readonly metrics: HTMLElement;
    readonly list: HTMLElement;
    readonly repairButton: { disabled: boolean; title: string };
    readonly bypassButton: { disabled: boolean; title: string; classList: DOMTokenList };
  };

  type JsonRecord = { readonly [key: string]: unknown };

  export function reportFromState(state: unknown): PrisonGuardReport | null {
    return parseReport(record(state)?.prisonGuardReport);
  }

  export function bypassFromState(state: unknown): PrisonBypassView | null {
    const row = record(state);
    if (!row) return null;
    const options = record(row.trainerOptions) || {};
    const stats = record(row.prisonBypassStats);
    return {
      active: options.prisonBypass === true,
      stats: stats ? {
        blockedSwitch520: Number(stats.blockedSwitch520 || 0),
        blockedDisableSave: Number(stats.blockedDisableSave || 0),
        blockedTransfer695: Number(stats.blockedTransfer695 || 0),
        rescueCount: Number(stats.rescueCount || 0)
      } : null
    };
  }

  export function applyPanel(
    elements: PrisonGuardElements,
    report: PrisonGuardReport | null,
    live: boolean,
    bypass: PrisonBypassView | null
  ): void {
    const level = summaryLevel(report, live, bypass);
    elements.summary.className = `prison-summary prison-${level}`;
    elements.summary.textContent = summaryText(report, live, bypass);
    elements.metrics.innerHTML = metricsHtml(report, live, bypass);
    elements.list.innerHTML = listHtml(report, live);
    const canRepair = live && !!report && report.hits.some((check) => check.fixable);
    elements.repairButton.disabled = !canRepair;
    elements.repairButton.title = canRepair
      ? "修复数值、关键物品和 Switch520；不会处理运行时 param(9) 提示"
      : "没有可自动修复的硬风险";
    elements.bypassButton.disabled = !live;
    elements.bypassButton.classList.toggle("active", !!bypass?.active);
    elements.bypassButton.title = bypass?.active
      ? "已开启：拦截 Switch520 / 禁存档 / Map695 传送，并自动脱困"
      : "开启后拦截 Switch520 / 禁存档 / Map695 传送，并自动脱困";
  }

  function summaryLevel(report: PrisonGuardReport | null, live: boolean, bypass: PrisonBypassView | null): string {
    if (!live || !report) return "idle";
    if (bypass?.active) {
      if (report.hits.length > 0) return "warning";
      return "ok";
    }
    if (report.hits.length > 0) return "danger";
    if (report.warnings.length > 0) return "warning";
    return "ok";
  }

  function summaryText(report: PrisonGuardReport | null, live: boolean, bypass: PrisonBypassView | null): string {
    if (!report) return "等待运行时检测";
    if (!live) return "状态过期，等待刷新";
    if (bypass && bypass.active) {
      if (report.hits.length > 0) {
        return `已屏蔽惩处（仍检测到 ${report.hits.length} 项硬风险）`;
      }
      return "已屏蔽：520 / 禁存档 / Map695 传送将被拦截";
    }
    if (report.hits.length > 0) return `${report.hits.length} 项硬风险`;
    if (report.warnings.length > 0) return `${report.warnings.length} 项提示`;
    return "检查通过";
  }

  function metricsHtml(report: PrisonGuardReport | null, live: boolean, bypass: PrisonBypassView | null): string {
    const hits = report ? report.hits.length : 0;
    const warnings = report ? report.warnings.length : 0;
    const switchText = report?.punishmentSwitch ? "ON" : "OFF";
    const mapText = report?.mapId == null ? "-" : `${report.mapId} (${report.playerX ?? "-"}, ${report.playerY ?? "-"})`;
    const blocked = bypass && bypass.stats
      ? (
          Number(bypass.stats.blockedSwitch520 || 0) +
          Number(bypass.stats.blockedDisableSave || 0) +
          Number(bypass.stats.blockedTransfer695 || 0)
        )
      : 0;
    return [
      metric("硬风险", hits),
      metric("提示", warnings),
      metric("Switch520", live && report ? switchText : "-"),
      metric("位置", live && report ? mapText : "-"),
      metric("屏蔽", live && bypass ? (bypass.active ? "ON" : "OFF") : "-"),
      metric("拦截", live && bypass ? blocked : "-")
    ].join("");
  }

  function listHtml(report: PrisonGuardReport | null, live: boolean): string {
    if (!report) return `<div class="prison-empty">bridge 连接后自动检测。</div>`;
    const visible = [...report.hits, ...report.warnings];
    if (visible.length === 0) return `<div class="prison-empty">${live ? "未发现硬风险。" : "上次检测未发现硬风险。"}</div>`;
    return visible.map(checkHtml).join("");
  }

  function checkHtml(check: PrisonGuardCheck): string {
    const note = check.note ? `<small>${escapeHtml(check.note)}</small>` : "";
    return [
      `<div class="prison-item ${check.severity}">`,
      `<strong>${escapeHtml(check.label)}</strong>`,
      `<span>${escapeHtml(check.group)} / 当前 ${escapeHtml(check.value)} / 安全 ${escapeHtml(check.limit)}</span>`,
      `<small>${escapeHtml(check.effect)}</small>`,
      note,
      `</div>`
    ].join("");
  }

  function metric(label: string, value: unknown): string {
    return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
  }

  function parseReport(value: unknown): PrisonGuardReport | null {
    const row = record(value);
    if (!row) return null;
    const checks = array(row.checks).flatMap(parseCheck);
    const hits = checks.filter((check) => check.severity === "danger");
    const warnings = checks.filter((check) => check.severity === "warning");
    return {
      checks,
      hits,
      warnings,
      punishmentSwitch: row.punishmentSwitch === true,
      mapId: nullableNumber(row.mapId),
      playerX: nullableNumber(row.playerX),
      playerY: nullableNumber(row.playerY)
    };
  }

  function parseCheck(value: unknown): PrisonGuardCheck[] {
    const row = record(value);
    if (!row) return [];
    return [{
      id: text(row.id),
      group: text(row.group),
      label: text(row.label),
      path: text(row.path),
      value: text(row.value),
      limit: text(row.limit),
      effect: text(row.effect),
      severity: severity(row.severity),
      fixable: row.fixable === true,
      note: text(row.note)
    }];
  }

  function severity(value: unknown): GuardSeverity {
    if (value === "danger") return "danger";
    if (value === "warning") return "warning";
    return "ok";
  }

  function array(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
  }

  function text(value: unknown): string {
    return value == null ? "" : String(value);
  }

  function nullableNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function record(value: unknown): JsonRecord | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  }

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char] || char));
  }
}
