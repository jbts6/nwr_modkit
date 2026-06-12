export type GuardSeverity = "danger" | "warning" | "ok";

export interface PrisonGuardCheck {
  id: string;
  group: string;
  label: string;
  path: string;
  value: string;
  limit: string;
  effect: string;
  severity: GuardSeverity;
  fixable: boolean;
  note?: string;
}

export interface PrisonGuardReport {
  checks: PrisonGuardCheck[];
  hits: PrisonGuardCheck[];
  warnings: PrisonGuardCheck[];
  punishmentSwitch: boolean;
  mapId: number | null;
  playerX: number | null;
  playerY: number | null;
}

interface NumericGuard {
  id: string;
  group: string;
  label: string;
  path: string;
  limit: number;
  safeValue: number;
  effect: string;
  read: (save: unknown) => number;
  write: (save: unknown, value: number) => void;
}

interface MissingItemGuard {
  id: string;
  group: string;
  label: string;
  actorId: number;
  itemId: number;
  actorName: string;
  itemName: string;
  commonEventId: number;
  effect: string;
}

const NUMERIC_GUARDS: NumericGuard[] = [
  {
    id: "armor-400",
    group: "直接传送",
    label: "至尊魔戒数量",
    path: "party._armors.400",
    limit: 3,
    safeValue: 2,
    effect: "CE334：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
    read: (save) => getBagCount(save, "_armors", 400),
    write: (save, value) => setBagCount(save, "_armors", 400, value)
  },
  {
    id: "item-656",
    group: "直接传送",
    label: "传说的灵魂结晶",
    path: "party._items.656",
    limit: 200,
    safeValue: 199,
    effect: "CE337：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
    read: (save) => getBagCount(save, "_items", 656),
    write: (save, value) => setBagCount(save, "_items", 656, value)
  },
  {
    id: "item-653",
    group: "直接传送",
    label: "红色萃取精华",
    path: "party._items.653",
    limit: 200,
    safeValue: 199,
    effect: "CE338：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
    read: (save) => getBagCount(save, "_items", 653),
    write: (save, value) => setBagCount(save, "_items", 653, value)
  },
  {
    id: "item-654",
    group: "直接传送",
    label: "橙色萃取精华",
    path: "party._items.654",
    limit: 80,
    safeValue: 79,
    effect: "CE339：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
    read: (save) => getBagCount(save, "_items", 654),
    write: (save, value) => setBagCount(save, "_items", 654, value)
  },
  {
    id: "gold",
    group: "直接传送",
    label: "金币",
    path: "party._gold",
    limit: 9000000,
    safeValue: 8999999,
    effect: "CE340：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
    read: (save) => toNumber(getRecord(getRecord(save, "party"), "_gold")),
    write: (save, value) => setRecordValue(getRecord(save, "party"), "_gold", value)
  },
  {
    id: "var-29",
    group: "直接传送",
    label: "功勋变量",
    path: "variables._data.@a[29]",
    limit: 5000,
    safeValue: 4999,
    effect: "CE341：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
    read: (save) => getWrappedArrayNumber(getRecord(getRecord(save, "variables"), "_data"), 29),
    write: (save, value) => setWrappedArrayNumber(getRecord(getRecord(save, "variables"), "_data"), 29, value)
  },
  {
    id: "item-730",
    group: "直接传送",
    label: "浮世绘卷",
    path: "party._items.730",
    limit: 2,
    safeValue: 1,
    effect: "CE342/343：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
    read: (save) => getBagCount(save, "_items", 730),
    write: (save, value) => setBagCount(save, "_items", 730, value)
  },
  {
    id: "var-210",
    group: "只开惩处",
    label: "针剂进化次数",
    path: "variables._data.@a[210]",
    limit: 99,
    safeValue: 98,
    effect: "CE335：Switch520 ON，禁用存档",
    read: (save) => getWrappedArrayNumber(getRecord(getRecord(save, "variables"), "_data"), 210),
    write: (save, value) => setWrappedArrayNumber(getRecord(getRecord(save, "variables"), "_data"), 210, value)
  },
  {
    id: "item-45",
    group: "只开惩处",
    label: "全面进化针剂",
    path: "party._items.45",
    limit: 99,
    safeValue: 98,
    effect: "CE336：Switch520 ON，禁用存档",
    read: (save) => getBagCount(save, "_items", 45),
    write: (save, value) => setBagCount(save, "_items", 45, value)
  }
];

const MISSING_ITEM_GUARDS: MissingItemGuard[] = [
  {
    id: "ce-403-actor-16-item-49",
    group: "只开惩处",
    label: "角色 16 缺少关键物品 49",
    actorId: 16,
    itemId: 49,
    actorName: "(blank)",
    itemName: "(blank)",
    commonEventId: 403,
    effect: "CE403：Switch166 ON，Switch520 ON，禁用存档"
  },
  {
    id: "ce-405-actor-16-item-59",
    group: "直接传送",
    label: "闯帝判定关键物品",
    actorId: 16,
    itemId: 59,
    actorName: "(blank)",
    itemName: "赤炎魔杖",
    commonEventId: 405,
    effect: "CE405：梦魇传送处提示，Switch785 ON；提示终身监禁，Switch520 ON，禁用存档，传送 Map695"
  },
  {
    id: "ce-406-actor-57-item-819",
    group: "只开惩处",
    label: "天道佩恩判定关键物品",
    actorId: 57,
    itemId: 819,
    actorName: "立花野子",
    itemName: "东乙青木橛",
    commonEventId: 406,
    effect: "CE406：梦魇传送处提示，Switch781 ON，Switch520 ON，禁用存档"
  },
  {
    id: "ce-407-actor-48-item-73",
    group: "只开惩处",
    label: "冥主喵喵判定关键物品",
    actorId: 48,
    itemId: 73,
    actorName: "圣女-贞德",
    itemName: "圆润的珠子",
    commonEventId: 407,
    effect: "CE407：梦魇传送处提示，Switch784 ON，Switch520 ON，禁用存档"
  },
  {
    id: "ce-571-actor-57-item-101",
    group: "只开惩处",
    label: "角色 57 缺少关键物品 101",
    actorId: 57,
    itemId: 101,
    actorName: "立花野子",
    itemName: "(blank)",
    commonEventId: 571,
    effect: "CE571：梦魇传送处提示，Switch781 ON，Switch520 ON，禁用存档"
  },
  {
    id: "ce-572-actor-31-item-860",
    group: "只开惩处",
    label: "角色 31 缺少关键物品 860",
    actorId: 31,
    itemId: 860,
    actorName: "(blank)",
    itemName: "(blank)",
    commonEventId: 572,
    effect: "CE572：梦魇传送处提示，Switch1067 ON，Switch520 ON，禁用存档"
  }
];

export function analyzePrisonGuards(save: unknown): PrisonGuardReport {
  const checks: PrisonGuardCheck[] = NUMERIC_GUARDS.map((guard) => {
    const value = guard.read(save);
    const hit = value >= guard.limit;
    return {
      id: guard.id,
      label: guard.label,
      path: guard.path,
      value: String(value),
      limit: `< ${guard.limit}`,
      group: guard.group,
      effect: guard.effect,
      severity: hit ? "danger" as const : "ok" as const,
      fixable: hit
    };
  });

  for (const guard of MISSING_ITEM_GUARDS) {
    const actorInParty = getPartyActorIds(save).includes(guard.actorId);
    const itemCount = getBagCount(save, "_items", guard.itemId);
    const hit = actorInParty && itemCount <= 0;
    checks.push({
      id: guard.id,
      group: guard.group,
      label: guard.label,
      path: `CE${guard.commonEventId}: party has actor ${guard.actorName} #${guard.actorId}, requires item ${guard.itemName} #${guard.itemId}`,
      value: actorInParty ? `actor in party, item=${itemCount}` : "actor not in party",
      limit: "actor absent or item >= 1",
      effect: guard.effect,
      severity: hit ? "danger" : "ok",
      fixable: hit,
      note: hit ? "一键修复会补 1 个要求物品，不会移除角色。" : undefined
    });
  }

  const punishmentSwitch = getWrappedArrayBoolean(getRecord(getRecord(save, "switches"), "_data"), 520);
  checks.unshift({
    id: "switch-520",
    group: "惩处状态",
    label: "破坏规则惩处开关",
    path: "switches._data.@a[520]",
    value: punishmentSwitch ? "true" : "false",
    limit: "false",
    effect: "Map008 Event 1 Page 20 会因该开关切换事件页；部分判定会先打开此开关。",
    severity: punishmentSwitch ? "danger" : "ok",
    fixable: punishmentSwitch
  });

  checks.push({
    id: "actor-2-param-9",
    group: "运行时提示",
    label: "无名感知运行时判定",
    path: "CommonEvent 344: actor(2).param(9)",
    value: "运行时计算",
    limit: "< 19996",
    effect: "CE344：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
    severity: "warning",
    fixable: false,
    note: "该值依赖游戏运行时公式、装备和插件效果，存档编辑器只能提示，不能离线完全证明。"
  });

  return {
    checks,
    hits: checks.filter((check) => check.severity === "danger"),
    warnings: checks.filter((check) => check.severity === "warning"),
    punishmentSwitch,
    mapId: getNullableNumber(getRecord(getRecord(save, "map"), "_mapId")),
    playerX: getNullableNumber(getRecord(getRecord(save, "player"), "_x")),
    playerY: getNullableNumber(getRecord(getRecord(save, "player"), "_y"))
  };
}

export function repairPrisonGuards(save: unknown): { value: unknown; fixed: PrisonGuardCheck[] } {
  const clone = deepClone(save);
  const before = analyzePrisonGuards(clone);
  const fixed: PrisonGuardCheck[] = [];

  for (const guard of NUMERIC_GUARDS) {
    if (guard.read(clone) >= guard.limit) {
      guard.write(clone, guard.safeValue);
      const check = before.checks.find((item) => item.id === guard.id);
      if (check) fixed.push(check);
    }
  }

  for (const guard of MISSING_ITEM_GUARDS) {
    if (getPartyActorIds(clone).includes(guard.actorId) && getBagCount(clone, "_items", guard.itemId) <= 0) {
      setBagCount(clone, "_items", guard.itemId, 1);
      const check = before.checks.find((item) => item.id === guard.id);
      if (check) fixed.push(check);
    }
  }

  if (getWrappedArrayBoolean(getRecord(getRecord(clone, "switches"), "_data"), 520)) {
    setWrappedArrayBoolean(getRecord(getRecord(clone, "switches"), "_data"), 520, false);
    const check = before.checks.find((item) => item.id === "switch-520");
    if (check) fixed.push(check);
  }

  return { value: clone, fixed };
}

export function hasBlockingPrisonRisk(report: PrisonGuardReport): boolean {
  return report.hits.length > 0;
}

function deepClone(value: unknown): unknown {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function getRecord(value: unknown, key?: string): Record<string, unknown> | null {
  const target = key === undefined ? value : getRecord(value)?.[key];
  return target && typeof target === "object" && !Array.isArray(target)
    ? target as Record<string, unknown>
    : null;
}

function setRecordValue(record: Record<string, unknown> | null, key: string, value: unknown): void {
  if (!record) return;
  record[key] = value;
}

function getWrappedArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = getRecord(value);
  const array = record?.["@a"];
  return Array.isArray(array) ? array : [];
}

function getWrappedArrayNumber(value: unknown, index: number): number {
  return toNumber(getWrappedArray(value)[index]);
}

function setWrappedArrayNumber(value: unknown, index: number, next: number): void {
  const array = getWrappedArray(value);
  if (!array.length && !Array.isArray(value)) return;
  array[index] = next;
}

function getWrappedArrayBoolean(value: unknown, index: number): boolean {
  return getWrappedArray(value)[index] === true;
}

function setWrappedArrayBoolean(value: unknown, index: number, next: boolean): void {
  const array = getWrappedArray(value);
  if (!array.length && !Array.isArray(value)) return;
  array[index] = next;
}

function getBagCount(save: unknown, bagName: "_items" | "_weapons" | "_armors", id: number): number {
  const bag = getRecord(getRecord(save, "party"), bagName);
  return toNumber(bag?.[String(id)]);
}

function getPartyActorIds(save: unknown): number[] {
  return getWrappedArray(getRecord(getRecord(save, "party"), "_actors"))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function setBagCount(save: unknown, bagName: "_items" | "_weapons" | "_armors", id: number, value: number): void {
  const bag = getRecord(getRecord(save, "party"), bagName);
  if (!bag) return;
  if (value <= 0) delete bag[String(id)];
  else bag[String(id)] = value;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
