namespace NwrGuiCatalogUi {
  export const CATALOG_LIST_IDS = [
    "itemList",
    "skillList",
    "actorList",
    "variableList",
    "switchList",
    "mapList",
    "commonEventList"
  ] as const;

  export type CatalogPageAction = "first" | "prev" | "next" | "last";

  export type CatalogTextTarget = {
    textContent: string | null;
  };

  export type CatalogClassList = {
    contains(name: string): boolean;
  };

  export type CatalogListTarget = {
    readonly id: string;
    scrollTop: number;
    readonly clientWidth: number;
    innerHTML: string;
    readonly classList: CatalogClassList;
    readonly offsetParent: unknown | null;
    closest(selector: string): unknown | null;
  };

  export type CatalogListOptions = {
    readonly kind?: string;
    readonly query?: unknown;
    readonly selectedId?: unknown;
    readonly key?: (entry: NwrGuiCatalog.CatalogEntry) => unknown;
    readonly rowKind?: (entry: NwrGuiCatalog.CatalogEntry) => unknown;
    readonly leading: (entry: NwrGuiCatalog.CatalogEntry) => string;
    readonly actions: (entry: NwrGuiCatalog.CatalogEntry) => string;
    readonly extra?: (entry: NwrGuiCatalog.CatalogEntry) => unknown;
    readonly description?: (entry: NwrGuiCatalog.CatalogEntry) => unknown;
    readonly countTarget?: CatalogTextTarget | null;
  };

  export type MutableCatalogView = {
    readonly targetId: string;
    readonly entries: readonly NwrGuiCatalog.CatalogEntry[];
    readonly sourceEntries: readonly NwrGuiCatalog.CatalogEntry[];
    readonly filteredEntries: readonly NwrGuiCatalog.CatalogEntry[];
    readonly options: CatalogListOptions;
    readonly rowHeight: number;
    readonly queryKey: string;
    readonly page: number;
    readonly pageSize: number;
    readonly pageCount: number;
    readonly filtered: NwrGuiCatalog.FilterResult;
    readonly selectedKey: string;
    renderKey?: string;
  };

  export type CatalogViewInput = {
    readonly targetId: string;
    readonly previousView?: MutableCatalogView | null;
    readonly sourceEntries: readonly NwrGuiCatalog.CatalogEntry[];
    readonly options: CatalogListOptions;
    readonly pager: NwrGuiCatalog.CatalogPager;
  };

  export type CatalogRenderContext = {
    readonly iconRenderVersion: number;
  };

  export type WheelForwardInput = {
    readonly deltaY: number;
    readonly scrollTop: number;
    readonly scrollHeight: number;
    readonly clientHeight: number;
  };

  export function createCatalogView(input: CatalogViewInput): MutableCatalogView {
    const queryKey = `${input.options.kind || ""}:${input.options.query || ""}`;
    const pageState = input.pager.stateFor(input.targetId, queryKey);
    const filtered = NwrGuiCatalog.filterEntries(input.sourceEntries, input.options.query);
    let pageCount = input.pager.clamp(pageState, filtered.total);
    const selectedKey = input.options.selectedId == null ? "" : String(input.options.selectedId);
    const shouldLocateSelected = selectedKey !== ""
      && (!input.previousView || input.previousView.queryKey !== queryKey || input.previousView.selectedKey !== selectedKey);

    if (shouldLocateSelected && filtered.entries.length) {
      const selectedIndex = filtered.entries.findIndex((entry) => (
        String(NwrGuiCatalog.catalogEntryKey(entry, input.options.key)) === selectedKey
      ));
      if (selectedIndex >= 0) {
        pageState.page = Math.floor(selectedIndex / pageState.pageSize) + 1;
        pageCount = input.pager.clamp(pageState, filtered.total);
      }
    }

    const pageStart = input.pager.start(pageState);
    const visibleEntries = filtered.entries.slice(pageStart, pageStart + pageState.pageSize);
    return {
      targetId: input.targetId,
      entries: visibleEntries,
      sourceEntries: input.sourceEntries,
      filteredEntries: filtered.entries,
      options: input.options,
      rowHeight: NwrGuiCatalog.CATALOG_ROW_HEIGHT,
      queryKey,
      page: pageState.page,
      pageSize: pageState.pageSize,
      pageCount,
      filtered,
      selectedKey
    };
  }

  export function applyCatalogCountTarget(view: MutableCatalogView): void {
    const target = view.options.countTarget;
    if (target) target.textContent = NwrGuiCatalog.catalogCountText(view.filtered, view.page, view.pageCount);
  }

  export function renderVirtualCatalog(
    target: CatalogListTarget,
    view: MutableCatalogView,
    context: CatalogRenderContext
  ): boolean {
    if (!elementIsVisible(target)) return false;
    if (target.classList.contains("catalog-list-collapsed")) return false;
    if (!view.entries.length) {
      target.innerHTML = '<div class="catalog-empty">没有匹配项</div>';
      view.renderKey = "empty";
      return true;
    }
    const renderKey = `static:${view.options.selectedId}:${view.page}:${view.entries.length}:${target.clientWidth}:${context.iconRenderVersion}`;
    if (view.renderKey === renderKey) return false;
    view.renderKey = renderKey;
    const rows = view.entries.map((entry, index) => catalogRowHtml(entry, view.options, index * view.rowHeight));
    target.innerHTML = `<div class="catalog-spacer" style="height:${view.entries.length * view.rowHeight}px">${rows.join("")}</div>`;
    return true;
  }

  export function changeCatalogPage(
    pager: NwrGuiCatalog.CatalogPager,
    view: MutableCatalogView,
    action: CatalogPageAction
  ): boolean {
    return pager.change(view.targetId, view.queryKey, action, Math.max(1, view.pageCount));
  }

  export function elementIsVisible(element: CatalogListTarget | null | undefined): boolean {
    return !!(element && element.offsetParent !== null && !element.closest("[hidden]"));
  }

  export function shouldForwardWheel(input: WheelForwardInput): boolean {
    if (!input.deltaY || input.scrollHeight <= input.clientHeight + 1) return false;
    const atTop = input.scrollTop <= 0;
    const atBottom = input.scrollTop + input.clientHeight >= input.scrollHeight - 1;
    return (input.deltaY < 0 && atTop) || (input.deltaY > 0 && atBottom);
  }

  function catalogRowHtml(entry: NwrGuiCatalog.CatalogEntry, options: CatalogListOptions, top: number): string {
    const rowKey = options.key ? options.key(entry) : entry.id;
    const rowKind = options.rowKind ? options.rowKind(entry) : options.kind || "";
    const active = String(rowKey) === String(options.selectedId) ? " active" : "";
    const extra = options.extra ? options.extra(entry) : "";
    const description = options.description ? options.description(entry) : "";
    return `<div class="catalog-row${active}" style="top:${top}px" data-kind="${escapeHtml(rowKind)}" data-id="${escapeHtml(entry.id)}">
      ${options.leading(entry)}
      <div class="catalog-main">
        <span class="catalog-name">${escapeHtml(entry.name)}</span>
        <span class="catalog-meta">ID ${entry.id}${extra ? " / " + escapeHtml(extra) : ""}</span>
        ${description ? `<span class="catalog-desc">${escapeHtml(description)}</span>` : ""}
      </div>
      <div class="catalog-actions">${options.actions(entry)}</div>
    </div>`;
  }

  function escapeHtml(value: unknown): string {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
