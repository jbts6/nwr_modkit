namespace NwrGuiCatalog {
  export const CATALOG_ROW_HEIGHT = 88;
  export const CATALOG_PAGE_SIZE = 20;
  export const DATALIST_LIMIT = 80;
  export const ITEM_KIND_LABELS: Record<string, string> = {
    item: "物品",
    weapon: "武器",
    armor: "防具"
  };

  export type CatalogEntry = {
    id: number;
    name: string;
    description: string;
    noteText: string;
    searchText: string;
    readonly [key: string]: unknown;
  };

  export type Catalogs = Record<string, CatalogEntry[]>;

  export type FilterResult = {
    entries: CatalogEntry[];
    total: number;
    hasMore: false;
    exact: true;
  };

  export type DatalistOption = {
    value: string | number;
    label: string;
  };

  export type CatalogPageState = {
    queryKey: string;
    page: number;
    pageSize: number;
  };

  export function cleanText(value: unknown): string {
    return String(value == null ? "" : value)
      .replace(/\\[A-Z]+\[[^\]]*\]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  export function cleanNote(value: unknown): string {
    return cleanText(value)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  export function makeSearchText(parts: readonly unknown[]): string {
    return parts
      .filter((part) => part != null && part !== "")
      .map((part) => String(part))
      .join(" ")
      .toLowerCase();
  }

  export function catalogName(catalogs: Catalogs, kind: string, id: unknown): string {
    const item = catalogEntry(catalogs, kind, id);
    return item ? item.name : "";
  }

  export function catalogEntry(catalogs: Catalogs, kind: string, id: unknown): CatalogEntry | null {
    const list = catalogs[kind] || [];
    const textId = String(id);
    const numberId = Number(id);
    return list.find((entry) => {
      if (kind === "all") return entry.uid === textId || entry.id === numberId;
      return entry.id === numberId;
    }) || null;
  }

  export function filterDatalistEntries(
    entries: readonly CatalogEntry[],
    query: unknown,
    limit: number
  ): CatalogEntry[] {
    const needle = String(query || "").trim().toLowerCase();
    const result: CatalogEntry[] = [];
    for (const entry of entries) {
      if (needle && !entryMatchesSearch(entry, needle)) continue;
      result.push(entry);
      if (result.length >= limit) break;
    }
    return result;
  }

  export function datalistOptions(
    entries: readonly CatalogEntry[],
    query: unknown,
    limit: number = DATALIST_LIMIT
  ): DatalistOption[] {
    return filterDatalistEntries(entries, query, limit).map((entry) => ({
      value: optionValue(entry),
      label: optionLabel(entry)
    }));
  }

  export function filterEntries(entries: readonly CatalogEntry[], query: unknown): FilterResult {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) {
      const copy = entries.slice();
      return { entries: copy, total: copy.length, hasMore: false, exact: true };
    }
    const result: CatalogEntry[] = [];
    for (const entry of entries) {
      if (entryMatchesSearch(entry, needle)) result.push(entry);
    }
    return { entries: result, total: result.length, hasMore: false, exact: true };
  }

  export function catalogEntryKey(entry: CatalogEntry, key?: (entry: CatalogEntry) => unknown): unknown {
    return key ? key(entry) : entry.id;
  }

  export function catalogCountText(result: FilterResult, page: number, pageCount: number): string {
    if (!result.total) return "0 条";
    return `共 ${result.total} 条 / ${page}/${pageCount} 页`;
  }

  export class CatalogPager {
    private readonly states = new Map<string, CatalogPageState>();

    constructor(private readonly defaultPageSize: number = CATALOG_PAGE_SIZE) {}

    stateFor(targetId: string, queryKey: string): CatalogPageState {
      const current = this.states.get(targetId);
      if (current && current.queryKey === queryKey) return current;
      const next = { queryKey, page: 1, pageSize: this.defaultPageSize };
      this.states.set(targetId, next);
      return next;
    }

    clamp(state: CatalogPageState, total: unknown): number {
      const pageCount = Math.max(1, Math.ceil(Math.max(0, Number(total || 0)) / state.pageSize));
      state.page = Math.min(Math.max(1, Math.floor(Number(state.page || 1))), pageCount);
      return pageCount;
    }

    start(state: CatalogPageState): number {
      return (Math.max(1, Number(state.page || 1)) - 1) * state.pageSize;
    }

    change(targetId: string, queryKey: string, action: string, pageCount: unknown): boolean {
      const state = this.stateFor(targetId, queryKey);
      const lastPage = Math.max(1, Number(pageCount || 1));
      let nextPage = Number(state.page || 1);
      if (action === "first") nextPage = 1;
      else if (action === "prev") nextPage -= 1;
      else if (action === "next") nextPage += 1;
      else if (action === "last") nextPage = lastPage;
      nextPage = Math.min(Math.max(1, Math.floor(nextPage)), lastPage);
      if (nextPage === state.page) return false;
      state.page = nextPage;
      return true;
    }
  }

  function optionValue(entry: CatalogEntry): string | number {
    if (typeof entry.value === "string" || typeof entry.value === "number") return entry.value;
    if (typeof entry.uid === "string" || typeof entry.uid === "number") return entry.uid;
    return entry.id;
  }

  function optionLabel(entry: CatalogEntry): string {
    return typeof entry.label === "string" ? entry.label : entry.name;
  }

  function entryMatchesSearch(entry: CatalogEntry, needle: string): boolean {
    if (!needle) return true;
    if (entry.searchText && entry.searchText.includes(needle)) return true;
    return [
      entry.id,
      entry.uid,
      entry.value,
      entry.label,
      entry.name,
      entry.description,
      entry.noteText
    ].some((part) => String(part == null ? "" : part).toLowerCase().includes(needle));
  }
}
