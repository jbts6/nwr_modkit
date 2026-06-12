namespace NwrGuiCatalogUi {
  export type CatalogToolState = {
    readonly collapseText: string;
    readonly expandText: string;
    readonly pageStatusText: string;
    readonly firstDisabled: boolean;
    readonly prevDisabled: boolean;
    readonly nextDisabled: boolean;
    readonly lastDisabled: boolean;
  };

  export type CatalogToolNode = {
    textContent: string | null;
    disabled?: boolean;
  };

  export type CatalogToolRoot = {
    querySelector(selector: string): CatalogToolNode | null;
  };

  export type CatalogToolElements = {
    readonly collapseButton: CatalogToolNode | null;
    readonly expandButton: CatalogToolNode | null;
    readonly status: CatalogToolNode | null;
    readonly firstButton: CatalogToolNode | null;
    readonly prevButton: CatalogToolNode | null;
    readonly nextButton: CatalogToolNode | null;
    readonly lastButton: CatalogToolNode | null;
  };

  export function catalogToolsHtml(): string {
    return `
        <button type="button" data-catalog-tool="collapse">收起</button>
        <button type="button" data-catalog-tool="expand">展开</button>
        <button type="button" data-catalog-tool="first">首页</button>
        <button type="button" data-catalog-tool="prev">上一页</button>
        <span class="catalog-page-status" data-catalog-tool="page-status">第 1 / 1 页</span>
        <button type="button" data-catalog-tool="next">下一页</button>
        <button type="button" data-catalog-tool="last">末页</button>
        <button type="button" data-catalog-tool="next-section">下一分类</button>
      `;
  }

  export function catalogToolState(
    view: MutableCatalogView | null | undefined,
    collapsed: boolean,
    expanded: boolean
  ): CatalogToolState {
    if (!view) return emptyCatalogToolState(collapsed, expanded);
    const visibleCount = view.entries.length;
    const total = Number(view.filtered.total || 0);
    const page = Number(view.page || 1);
    const pageCount = Number(view.pageCount || 1);
    return {
      collapseText: collapsed ? "显示" : "收起",
      expandText: expanded ? "标准" : "展开",
      pageStatusText: total ? `第 ${page} / ${pageCount} 页 · 本页 ${visibleCount} 条` : "无结果",
      firstDisabled: page <= 1 || !total,
      prevDisabled: page <= 1 || !total,
      nextDisabled: page >= pageCount || !total,
      lastDisabled: page >= pageCount || !total
    };
  }

  export function catalogToolElements(tools: CatalogToolRoot | null | undefined): CatalogToolElements {
    return {
      collapseButton: toolNode(tools, "collapse"),
      expandButton: toolNode(tools, "expand"),
      status: toolNode(tools, "page-status"),
      firstButton: toolNode(tools, "first"),
      prevButton: toolNode(tools, "prev"),
      nextButton: toolNode(tools, "next"),
      lastButton: toolNode(tools, "last")
    };
  }

  export function applyCatalogToolState(elements: CatalogToolElements, state: CatalogToolState): void {
    if (elements.collapseButton) elements.collapseButton.textContent = state.collapseText;
    if (elements.expandButton) elements.expandButton.textContent = state.expandText;
    if (elements.status) elements.status.textContent = state.pageStatusText;
    setDisabled(elements.firstButton, state.firstDisabled);
    setDisabled(elements.prevButton, state.prevDisabled);
    setDisabled(elements.nextButton, state.nextDisabled);
    setDisabled(elements.lastButton, state.lastDisabled);
  }

  function emptyCatalogToolState(collapsed: boolean, expanded: boolean): CatalogToolState {
    return {
      collapseText: collapsed ? "显示" : "收起",
      expandText: expanded ? "标准" : "展开",
      pageStatusText: "第 1 / 1 页",
      firstDisabled: true,
      prevDisabled: true,
      nextDisabled: true,
      lastDisabled: true
    };
  }

  function toolNode(tools: CatalogToolRoot | null | undefined, name: string): CatalogToolNode | null {
    return tools ? tools.querySelector(`[data-catalog-tool="${name}"]`) : null;
  }

  function setDisabled(button: CatalogToolNode | null, disabled: boolean): void {
    if (button) button.disabled = disabled;
  }
}
