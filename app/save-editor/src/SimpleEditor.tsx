import { useMemo, useState } from "react";

export type SimpleTab = "basic" | "variables" | "switches" | "inventory" | "actors";
export type InventoryKind = "all" | "items" | "weapons" | "armors";
type InventoryBagKind = Exclude<InventoryKind, "all">;

export interface CatalogEntry {
  id: number;
  kind?: string;
  name: string;
  iconIndex?: number;
  description?: string;
  note?: string;
  extra?: string;
  searchText?: string;
}

export interface GameDataIndex {
  generatedAt: string;
  gameTitle: string;
  switches: CatalogEntry[];
  variables: CatalogEntry[];
  actors: CatalogEntry[];
  items: CatalogEntry[];
  weapons: CatalogEntry[];
  armors: CatalogEntry[];
  skills: CatalogEntry[];
  classes: CatalogEntry[];
  maps: CatalogEntry[];
}

interface SimpleEditorProps {
  value: unknown | null;
  dataIndex: GameDataIndex | null;
  onChange: (value: unknown, message: string) => void;
}

const INVENTORY_LABELS: Record<InventoryKind, string> = {
  all: "全部",
  items: "物品",
  weapons: "武器",
  armors: "防具"
};
const PAGE_SIZE = 20;

export default function SimpleEditor({ value, dataIndex, onChange }: SimpleEditorProps) {
  const [tab, setTab] = useState<SimpleTab>("basic");
  const [variableQuery, setVariableQuery] = useState("");
  const [variablePage, setVariablePage] = useState(1);
  const [switchQuery, setSwitchQuery] = useState("");
  const [switchPage, setSwitchPage] = useState(1);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryKind, setInventoryKind] = useState<InventoryKind>("all");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [actorQuery, setActorQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [skillPage, setSkillPage] = useState(1);
  const [selectedActorId, setSelectedActorId] = useState(2);

  const save = value;
  const actorOptions = useMemo(() => {
    const partyIds = new Set(getPartyActorIds(save));
    return filterEntries(dataIndex?.actors || [], actorQuery)
      .sort((a, b) => Number(!partyIds.has(a.id)) - Number(!partyIds.has(b.id)) || a.id - b.id);
  }, [actorQuery, dataIndex, save]);
  const selectedActor = getActor(save, selectedActorId);
  const selectedActorData = dataIndex?.actors.find((actor) => actor.id === selectedActorId);
  const selectedClass = dataIndex?.classes.find((entry) => entry.id === getNumber(getField(selectedActor, "_classId")));
  const skillOptions = useMemo(() => filterEntries(dataIndex?.skills || [], skillQuery), [dataIndex, skillQuery]);
  const skillPageData = useMemo(() => paginate(skillOptions, skillPage), [skillOptions, skillPage]);
  const inventoryEntries = useMemo(() => {
    const entries = getInventoryCatalogEntries(dataIndex, inventoryKind);
    return filterEntries(entries, inventoryQuery)
      .sort((a, b) => Number(getInventoryCount(save, b) > 0) - Number(getInventoryCount(save, a) > 0) || inventorySortKey(a).localeCompare(inventorySortKey(b)));
  }, [dataIndex, inventoryKind, inventoryQuery, save]);
  const inventoryPageData = useMemo(() => paginate(inventoryEntries, inventoryPage), [inventoryEntries, inventoryPage]);
  const variableEntries = useMemo(() => {
    const values = getWrappedArray(getRecord(getRecord(save, "variables"), "_data"));
    return filterEntries(dataIndex?.variables || [], variableQuery)
      .sort((a, b) => Number(getNumber(values[b.id]) !== 0) - Number(getNumber(values[a.id]) !== 0) || a.id - b.id);
  }, [dataIndex, save, variableQuery]);
  const variablePageData = useMemo(() => paginate(variableEntries, variablePage), [variableEntries, variablePage]);
  const switchEntries = useMemo(() => {
    const values = getWrappedArray(getRecord(getRecord(save, "switches"), "_data"));
    return filterEntries(dataIndex?.switches || [], switchQuery)
      .sort((a, b) => Number(values[b.id] === true) - Number(values[a.id] === true) || a.id - b.id);
  }, [dataIndex, save, switchQuery]);
  const switchPageData = useMemo(() => paginate(switchEntries, switchPage), [switchEntries, switchPage]);

  if (!save) {
    return (
      <div className="simple-editor empty">
        <div className="simple-empty">
          <h2>简易编辑器</h2>
          <p>先打开一个存档或 JSON，然后这里会显示金币、变量、开关、背包和角色编辑区。</p>
        </div>
      </div>
    );
  }

  function update(mutator: (draft: unknown) => void, message: string): void {
    const draft = deepClone(save);
    mutator(draft);
    onChange(draft, message);
  }

  function setGold(nextValue: number): void {
    update((draft) => {
      const party = ensureRecord(draft, "party");
      party._gold = clampInteger(nextValue, 0);
    }, "已修改金币");
  }

  function setVariable(id: number, nextValue: number): void {
    update((draft) => {
      setWrappedArrayValue(getRecord(getRecord(draft, "variables"), "_data"), id, clampInteger(nextValue));
    }, `已修改变量 ${id}`);
  }

  function setSwitch(id: number, nextValue: boolean): void {
    update((draft) => {
      setWrappedArrayValue(getRecord(getRecord(draft, "switches"), "_data"), id, nextValue);
    }, `已修改开关 ${id}`);
  }

  function setInventoryCount(kind: InventoryBagKind, id: number, nextValue: number): void {
    update((draft) => {
      setBagCount(draft, kind, id, clampInteger(nextValue, 0));
    }, `已修改${INVENTORY_LABELS[kind]} ${id}`);
  }

  function setActorField(actorId: number, key: string, nextValue: number): void {
    update((draft) => {
      const actor = getActor(draft, actorId);
      if (actor) actor[key] = clampInteger(nextValue, 0);
    }, `已修改角色 ${actorId}`);
  }

  function setActorClassNumber(actorId: number, objectKey: string, classId: number, nextValue: number): void {
    update((draft) => {
      const actor = getActor(draft, actorId);
      const target = ensureRecord(actor, objectKey);
      target[String(classId)] = clampInteger(nextValue, 0);
    }, `已修改角色 ${actorId} ${objectKey}`);
  }

  function setActorParty(actorId: number, inParty: boolean): void {
    update((draft) => {
      const party = ensureRecord(draft, "party");
      const actors = ensureWrappedArray(party, "_actors");
      const exists = actors.includes(actorId);
      if (inParty && !exists) actors.push(actorId);
      if (!inParty && exists) {
        const next = actors.filter((id) => id !== actorId);
        actors.splice(0, actors.length, ...next);
      }
    }, inParty ? `已加入角色 ${actorId}` : `已移出角色 ${actorId}`);
  }

  function setActorSkill(actorId: number, skillId: number, learned: boolean): void {
    if (!skillId) return;
    update((draft) => {
      const actor = getActor(draft, actorId);
      const skills = ensureWrappedArray(ensureRecord(actor, "_skills"));
      const exists = skills.includes(skillId);
      if (learned && !exists) skills.push(skillId);
      if (!learned && exists) {
        const next = skills.filter((id) => id !== skillId);
        skills.splice(0, skills.length, ...next);
      }
    }, learned ? `已学习技能 ${skillId}` : `已遗忘技能 ${skillId}`);
  }

  const gold = getNumber(getField(getRecord(save, "party"), "_gold"));
  const variableValues = getWrappedArray(getRecord(getRecord(save, "variables"), "_data"));
  const switchValues = getWrappedArray(getRecord(getRecord(save, "switches"), "_data"));
  const partyActorIds = getPartyActorIds(save);
  const actorSkills = getWrappedArray(getRecord(selectedActor, "_skills")).filter(isNumber);
  const selectedClassId = Math.max(1, getNumber(getField(selectedActor, "_classId")));
  const actorBonusPoints = getClassNumber(selectedActor, "_bonusAllocationPoints", selectedClassId);
  const actorSpentPoints = getClassNumber(selectedActor, "_spentAllocationPoints", selectedClassId);
  const actorJp = getClassNumber(selectedActor, "_jp", selectedClassId);

  return (
    <div className="simple-editor">
      <div className="simple-toolbar">
        <div>
          <div className="eyebrow">SIMPLE SAVE EDITOR</div>
          <h2>简易编辑</h2>
        </div>
        <div className="simple-tabs" role="tablist" aria-label="简易编辑分类">
          {[
            ["basic", "基础"],
            ["variables", "变量"],
            ["switches", "开关"],
            ["inventory", "背包"],
            ["actors", "角色"]
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id as SimpleTab)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "basic" && (
        <section className="simple-section">
          <div className="simple-section-head">
            <h3>基础数值</h3>
            <span>直接写入存档路径 party._gold</span>
          </div>
          <div className="simple-form-grid">
            <label>
              <span>金币</span>
              <input type="number" value={gold} onChange={(event) => setGold(numberInput(event.currentTarget.value))} />
            </label>
            <div className="quick-buttons">
              {[10000, 100000, 1000000, 8999999].map((amount) => (
                <button key={amount} type="button" onClick={() => setGold(amount)}>{amount.toLocaleString()}</button>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === "variables" && (
        <section className="simple-section">
          <div className="simple-section-head">
            <h3>变量</h3>
            <span>来自 System.json variables</span>
          </div>
          <input
            className="simple-search"
            value={variableQuery}
            onChange={(event) => {
              setVariableQuery(event.currentTarget.value);
              setVariablePage(1);
            }}
            placeholder="搜索变量 ID 或名称"
          />
          <Pagination page={variablePageData.page} pageCount={variablePageData.pageCount} total={variablePageData.total} start={variablePageData.start} end={variablePageData.end} onPageChange={setVariablePage} />
          <div className="simple-table">
            {variablePageData.items.map((entry) => (
              <div className="simple-row" key={entry.id}>
                <div className="simple-row-main">
                  <strong>{entry.id}. {entry.name}</strong>
                  <span>variables._data.@a[{entry.id}]</span>
                </div>
                <input type="number" value={getNumber(variableValues[entry.id])} onChange={(event) => setVariable(entry.id, numberInput(event.currentTarget.value))} />
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "switches" && (
        <section className="simple-section">
          <div className="simple-section-head">
            <h3>开关</h3>
            <span>来自 System.json switches</span>
          </div>
          <input
            className="simple-search"
            value={switchQuery}
            onChange={(event) => {
              setSwitchQuery(event.currentTarget.value);
              setSwitchPage(1);
            }}
            placeholder="搜索开关 ID 或名称"
          />
          <Pagination page={switchPageData.page} pageCount={switchPageData.pageCount} total={switchPageData.total} start={switchPageData.start} end={switchPageData.end} onPageChange={setSwitchPage} />
          <div className="simple-table">
            {switchPageData.items.map((entry) => (
              <div className="simple-row" key={entry.id}>
                <div className="simple-row-main">
                  <strong>{entry.id}. {entry.name}</strong>
                  <span>switches._data.@a[{entry.id}]</span>
                </div>
                <label className="simple-toggle">
                  <input type="checkbox" checked={switchValues[entry.id] === true} onChange={(event) => setSwitch(entry.id, event.currentTarget.checked)} />
                  <span>{switchValues[entry.id] === true ? "ON" : "OFF"}</span>
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "inventory" && (
        <section className="simple-section">
          <div className="simple-section-head">
            <h3>背包</h3>
            <span>来自 Items / Weapons / Armors</span>
          </div>
          <div className="simple-filterbar">
            <select
              value={inventoryKind}
              onChange={(event) => {
                setInventoryKind(event.currentTarget.value as InventoryKind);
                setInventoryPage(1);
              }}
            >
              <option value="all">全部</option>
              <option value="items">物品</option>
              <option value="weapons">武器</option>
              <option value="armors">防具</option>
            </select>
            <input
              className="simple-search"
              value={inventoryQuery}
              onChange={(event) => {
                setInventoryQuery(event.currentTarget.value);
                setInventoryPage(1);
              }}
              placeholder="搜索 ID、名称、描述"
            />
          </div>
          <Pagination page={inventoryPageData.page} pageCount={inventoryPageData.pageCount} total={inventoryPageData.total} start={inventoryPageData.start} end={inventoryPageData.end} onPageChange={setInventoryPage} />
          <div className="simple-table inventory-table">
            {inventoryPageData.items.map((entry) => {
              const bagKind = inventoryBagKind(entry);
              const count = getInventoryCount(save, entry);
              return (
                <div className={count > 0 ? "simple-row owned" : "simple-row"} key={`${bagKind}:${entry.id}`}>
                  <div className="simple-row-main">
                    <strong>{INVENTORY_LABELS[bagKind]} {entry.id}. {entry.name}</strong>
                    <span>{entry.description || entry.extra || `${INVENTORY_LABELS[bagKind]} ${entry.id}`}</span>
                  </div>
                  <input type="number" min="0" value={count} onChange={(event) => setInventoryCount(bagKind, entry.id, numberInput(event.currentTarget.value))} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "actors" && (
        <section className="simple-section">
          <div className="simple-section-head">
            <h3>角色</h3>
            <span>来自 Actors / Classes / Skills</span>
          </div>
          <div className="simple-filterbar">
            <input className="simple-search" value={actorQuery} onChange={(event) => setActorQuery(event.currentTarget.value)} placeholder="搜索角色 ID 或名称" />
            <select value={selectedActorId} onChange={(event) => setSelectedActorId(numberInput(event.currentTarget.value))}>
              {actorOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.id}. {entry.name}</option>
              ))}
            </select>
          </div>

          <div className="actor-editor">
            <div className="actor-summary">
              <strong>{selectedActorId}. {selectedActor?._name ? String(selectedActor._name) : selectedActorData?.name || "未命名角色"}</strong>
              <span>{selectedClass ? `职业：${selectedClass.name}` : `职业 ID：${getNumber(getField(selectedActor, "_classId")) || "-"}`}</span>
              <label className="simple-toggle">
                <input type="checkbox" checked={partyActorIds.includes(selectedActorId)} onChange={(event) => setActorParty(selectedActorId, event.currentTarget.checked)} />
                <span>{partyActorIds.includes(selectedActorId) ? "队伍中" : "未入队"}</span>
              </label>
            </div>

            {selectedActor ? (
              <>
                <div className="simple-form-grid actor-stats">
                  <label><span>等级</span><input type="number" min="1" value={getNumber(selectedActor._level)} onChange={(event) => setActorField(selectedActorId, "_level", numberInput(event.currentTarget.value))} /></label>
                  <label><span>HP</span><input type="number" min="0" value={getNumber(selectedActor._hp)} onChange={(event) => setActorField(selectedActorId, "_hp", numberInput(event.currentTarget.value))} /></label>
                  <label><span>MP</span><input type="number" min="0" value={getNumber(selectedActor._mp)} onChange={(event) => setActorField(selectedActorId, "_mp", numberInput(event.currentTarget.value))} /></label>
                  <label><span>TP</span><input type="number" min="0" value={getNumber(selectedActor._tp)} onChange={(event) => setActorField(selectedActorId, "_tp", numberInput(event.currentTarget.value))} /></label>
                </div>

                <div className="point-editor">
                  <div className="simple-subhead">
                    <strong>属性点 / SP</strong>
                    <span>当前职业 ID：{selectedClassId}</span>
                  </div>
                  <div className="simple-form-grid point-grid">
                    <label>
                      <span>可用属性点</span>
                      <input type="number" min="0" value={actorBonusPoints} onChange={(event) => setActorClassNumber(selectedActorId, "_bonusAllocationPoints", selectedClassId, numberInput(event.currentTarget.value))} />
                    </label>
                    <label>
                      <span>已用属性点</span>
                      <input type="number" min="0" value={actorSpentPoints} onChange={(event) => setActorClassNumber(selectedActorId, "_spentAllocationPoints", selectedClassId, numberInput(event.currentTarget.value))} />
                    </label>
                    <label>
                      <span>SP / JP</span>
                      <input type="number" min="0" value={actorJp} onChange={(event) => setActorClassNumber(selectedActorId, "_jp", selectedClassId, numberInput(event.currentTarget.value))} />
                    </label>
                  </div>
                </div>

                <div className="skill-editor">
                  <div>
                    <strong>已学技能</strong>
                    <span>{actorSkills.length ? actorSkills.map((id) => skillName(dataIndex, id)).join("、") : "无"}</span>
                  </div>
                  <div className="simple-filterbar">
                    <input
                      className="simple-search"
                      value={skillQuery}
                      onChange={(event) => {
                        setSkillQuery(event.currentTarget.value);
                        setSkillPage(1);
                      }}
                      placeholder="搜索技能 ID 或名称"
                    />
                  </div>
                  <Pagination page={skillPageData.page} pageCount={skillPageData.pageCount} total={skillPageData.total} start={skillPageData.start} end={skillPageData.end} onPageChange={setSkillPage} />
                  <div className="simple-table skill-table">
                    {skillPageData.items.map((skill) => (
                      <div className={actorSkills.includes(skill.id) ? "simple-row owned" : "simple-row"} key={skill.id}>
                        <div className="simple-row-main">
                          <strong>{skill.id}. {skill.name}</strong>
                          <span>{skill.description || skill.note || "技能"}</span>
                        </div>
                        <button type="button" onClick={() => setActorSkill(selectedActorId, skill.id, !actorSkills.includes(skill.id))}>
                          {actorSkills.includes(skill.id) ? "遗忘" : "学习"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="simple-empty inline">该角色在当前存档里没有角色对象，暂时只能编辑入队状态。</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

interface PageData<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
  start: number;
  end: number;
}

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  start: number;
  end: number;
  onPageChange: (page: number) => void;
}

function Pagination({ page, pageCount, total, start, end, onPageChange }: PaginationProps) {
  const from = total === 0 ? 0 : start + 1;
  return (
    <div className="pagination-bar">
      <span>{from}-{end} / {total}</span>
      <div>
        <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1}>首页</button>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>上一页</button>
        <strong>{page} / {pageCount}</strong>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>下一页</button>
        <button type="button" onClick={() => onPageChange(pageCount)} disabled={page >= pageCount}>末页</button>
      </div>
    </div>
  );
}

function paginate<T>(items: T[], requestedPage: number): PageData<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  return {
    items: items.slice(start, end),
    page,
    pageCount,
    total,
    start,
    end
  };
}

function filterEntries(entries: CatalogEntry[], query: string): CatalogEntry[] {
  const text = query.trim().toLowerCase();
  return text
    ? entries.filter((entry) => `${entry.id} ${entry.name} ${entry.searchText || ""}`.toLowerCase().includes(text))
    : entries;
}

function getInventoryCatalogEntries(dataIndex: GameDataIndex | null, kind: InventoryKind): CatalogEntry[] {
  if (!dataIndex) return [];
  if (kind !== "all") return dataIndex[kind];
  return [
    ...dataIndex.items,
    ...dataIndex.weapons,
    ...dataIndex.armors
  ];
}

function inventoryBagKind(entry: CatalogEntry): InventoryBagKind {
  if (entry.kind === "weapon") return "weapons";
  if (entry.kind === "armor") return "armors";
  return "items";
}

function inventorySortKey(entry: CatalogEntry): string {
  const order: Record<InventoryBagKind, number> = { items: 0, weapons: 1, armors: 2 };
  const kind = inventoryBagKind(entry);
  return `${order[kind]}:${String(entry.id).padStart(6, "0")}`;
}

function skillName(dataIndex: GameDataIndex | null, id: number): string {
  const skill = dataIndex?.skills.find((entry) => entry.id === id);
  return skill ? `${id}.${skill.name}` : String(id);
}

function deepClone(value: unknown): unknown {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getRecord(value: unknown, key: string): Record<string, unknown> | null;
function getRecord(value: unknown, key?: string): Record<string, unknown> | null {
  const target = key === undefined ? value : asRecord(value)?.[key];
  return asRecord(target);
}

function getField(value: unknown, key: string): unknown {
  return asRecord(value)?.[key];
}

function getClassNumber(actor: unknown, key: string, classId: number): number {
  return getNumber(getRecord(actor, key)?.[String(classId)]);
}

function ensureRecord(value: unknown, key?: string): Record<string, unknown> {
  if (key === undefined) {
    const record = asRecord(value);
    if (!record) throw new Error("目标不是对象。");
    return record;
  }
  const record = ensureRecord(value);
  if (!asRecord(record[key])) record[key] = {};
  return record[key] as Record<string, unknown>;
}

function getWrappedArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  const array = record?.["@a"];
  return Array.isArray(array) ? array : [];
}

function ensureWrappedArray(record: Record<string, unknown> | null, key?: string): unknown[] {
  if (!record) return [];
  const target = key ? ensureRecord(record, key) : record;
  if (!Array.isArray(target["@a"])) target["@a"] = [];
  return target["@a"] as unknown[];
}

function setWrappedArrayValue(value: unknown, index: number, next: unknown): void {
  const array = getWrappedArray(value);
  if (!array.length && !Array.isArray(value) && !asRecord(value)) return;
  array[index] = next;
}

function getActor(save: unknown, actorId: number): Record<string, unknown> | null {
  const actors = getWrappedArray(getRecord(getRecord(save, "actors"), "_data"));
  return asRecord(actors[actorId]);
}

function getPartyActorIds(save: unknown): number[] {
  return getWrappedArray(getRecord(getRecord(save, "party"), "_actors")).filter(isNumber);
}

function getBag(save: unknown, kind: InventoryBagKind): Record<string, unknown> | null {
  const key = kind === "items" ? "_items" : kind === "weapons" ? "_weapons" : "_armors";
  return getRecord(getRecord(save, "party"), key);
}

function getBagValue(bag: Record<string, unknown> | null, id: number): number {
  return getNumber(bag?.[String(id)]);
}

function getInventoryCount(save: unknown, entry: CatalogEntry): number {
  return getBagValue(getBag(save, inventoryBagKind(entry)), entry.id);
}

function setBagCount(save: unknown, kind: InventoryBagKind, id: number, count: number): void {
  const bag = getBag(save, kind);
  if (!bag) return;
  if (count <= 0) delete bag[String(id)];
  else bag[String(id)] = count;
}

function numberInput(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampInteger(value: number, min?: number): number {
  const next = Math.trunc(Number.isFinite(value) ? value : 0);
  return min == null ? next : Math.max(min, next);
}

function getNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
