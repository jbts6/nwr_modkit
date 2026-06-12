namespace NwrGuiCatalog {
  export type JsonRecord = { readonly [key: string]: unknown };

  export type PathAdapter = {
    readonly join: (...segments: readonly string[]) => string;
  };

  export type FileSystemAdapter = {
    readonly existsSync: (filePath: string) => boolean;
    readonly readFileSync: (filePath: string, encoding: "utf8") => string;
    readonly readdirSync: (filePath: string) => string[];
  };

  export function loadCatalogs(fs: FileSystemAdapter, path: PathAdapter, dataDir: string): Catalogs {
    const systemData = NwrGuiCatalog.record(NwrGuiCatalog.readJson(fs, path.join(dataDir, "System.json")));
    const catalogs: Catalogs = {
      variable: loadNamedArrayCatalog(NwrGuiCatalog.arrayField(systemData, "variables")),
      switch: loadNamedArrayCatalog(NwrGuiCatalog.arrayField(systemData, "switches")),
      item: loadCatalog(fs, path, dataDir, "Items.json"),
      weapon: loadCatalog(fs, path, dataDir, "Weapons.json"),
      armor: loadCatalog(fs, path, dataDir, "Armors.json"),
      actor: loadCatalog(fs, path, dataDir, "Actors.json"),
      skill: loadCatalog(fs, path, dataDir, "Skills.json"),
      map: loadMapCatalog(fs, path, dataDir),
      commonEvent: loadCommonEventCatalog(fs, path, dataDir),
      all: []
    };
    catalogs.all = buildAllItemCatalog(catalogs);
    return catalogs;
  }

  export function readJsonArray(fs: FileSystemAdapter, filePath: string): readonly unknown[] {
    const data = NwrGuiCatalog.readJson(fs, filePath);
    return Array.isArray(data) ? data : [];
  }

  export function readJson(fs: FileSystemAdapter, filePath: string): unknown {
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  export function finiteNumber(value: unknown, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  export function arrayField(row: JsonRecord | null, key: string): readonly unknown[] {
    const value = row ? row[key] : null;
    return Array.isArray(value) ? value : [];
  }

  export function property(row: JsonRecord | null, key: string): unknown {
    return row ? row[key] : undefined;
  }

  export function record(value: unknown): JsonRecord | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  }

  export function isRecord(value: JsonRecord | null): value is JsonRecord {
    return !!value;
  }

  export function isIdRecord(value: unknown): value is JsonRecord {
    const row = NwrGuiCatalog.record(value);
    return !!row && Number.isFinite(Number(row.id));
  }

  export function isNamedIdRecord(value: unknown): value is JsonRecord {
    const row = NwrGuiCatalog.record(value);
    return !!row && Number.isFinite(Number(row.id)) && !!row.name;
  }

  export function unique(values: readonly string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
  }

  export function uniqueNumbers(values: readonly number[]): number[] {
    return Array.from(new Set(values.filter(Number.isFinite))).sort((a, b) => a - b);
  }

  function loadCatalog(fs: FileSystemAdapter, path: PathAdapter, dataDir: string, fileName: string): CatalogEntry[] {
    const data = NwrGuiCatalog.readJson(fs, path.join(dataDir, fileName));
    if (!Array.isArray(data)) return [];
    return data.filter(NwrGuiCatalog.isNamedIdRecord).map((entry) => {
      const description = NwrGuiCatalog.cleanText(entry.description || "");
      const noteText = NwrGuiCatalog.cleanNote(entry.note || "");
      const id = Number(entry.id);
      return {
        id,
        name: String(entry.name),
        iconIndex: NwrGuiCatalog.finiteNumber(entry.iconIndex, 0),
        description,
        noteText,
        searchText: NwrGuiCatalog.makeSearchText([id, entry.name, description, noteText]),
        faceName: entry.faceName ? String(entry.faceName) : "",
        characterName: entry.characterName ? String(entry.characterName) : ""
      };
    });
  }

  function buildAllItemCatalog(catalogs: Catalogs): CatalogEntry[] {
    return ["item", "weapon", "armor"].flatMap((kind) => {
      const kindLabel = NwrGuiCatalog.ITEM_KIND_LABELS[kind] || kind;
      return (catalogs[kind] || []).map((entry) => ({
        ...entry,
        kind,
        kindLabel,
        uid: `${kind}:${entry.id}`,
        value: `${kind}:${entry.id}`,
        label: `${kindLabel} / ${entry.name}`,
        searchText: NwrGuiCatalog.makeSearchText([
          entry.searchText,
          `${kind}:${entry.id}`,
          entry.id,
          entry.name,
          entry.description,
          entry.noteText,
          kind,
          kindLabel
        ])
      }));
    });
  }

  function loadNamedArrayCatalog(names: readonly unknown[]): CatalogEntry[] {
    return names.flatMap((name, index) => {
      const text = NwrGuiCatalog.cleanText(name || "");
      if (!text) return [];
      return [{
        id: index,
        name: text,
        description: "",
        noteText: "",
        searchText: NwrGuiCatalog.makeSearchText([index, text, name])
      }];
    });
  }

  function loadMapCatalog(fs: FileSystemAdapter, path: PathAdapter, dataDir: string): CatalogEntry[] {
    const data = NwrGuiCatalog.readJson(fs, path.join(dataDir, "MapInfos.json"));
    if (!Array.isArray(data)) return [];
    return data.filter(NwrGuiCatalog.isNamedIdRecord).map((entry) => {
      const parent = entry.parentId == null ? "" : `父级 ${entry.parentId}`;
      const order = entry.order == null ? "" : `序 ${entry.order}`;
      return {
        id: Number(entry.id),
        name: NwrGuiCatalog.cleanText(entry.name),
        description: [parent, order].filter(Boolean).join(" / "),
        noteText: "",
        parentId: entry.parentId,
        order: entry.order,
        searchText: NwrGuiCatalog.makeSearchText([entry.id, entry.name, parent, order])
      };
    });
  }

  function loadCommonEventCatalog(fs: FileSystemAdapter, path: PathAdapter, dataDir: string): CatalogEntry[] {
    return NwrGuiCatalog.readJsonArray(fs, path.join(dataDir, "CommonEvents.json"))
      .filter(NwrGuiCatalog.isNamedIdRecord)
      .map((entry) => {
        const trigger = entry.trigger === 1 ? "自动" : entry.trigger === 2 ? "并行" : "调用";
        const sw = entry.switchId ? `开关 ${entry.switchId}` : "";
        return {
          id: Number(entry.id),
          name: NwrGuiCatalog.cleanText(entry.name),
          description: [trigger, sw].filter(Boolean).join(" / "),
          noteText: "",
          trigger: entry.trigger,
          switchId: entry.switchId,
          searchText: NwrGuiCatalog.makeSearchText([entry.id, entry.name, trigger, sw])
        };
      });
  }
}
