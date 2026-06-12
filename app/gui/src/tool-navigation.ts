namespace NwrGuiToolNavigation {
  export type ToolSection = {
    readonly section: string;
    readonly label: string;
  };

  export type ToolPanelSnapshot = {
    readonly tab: string;
    readonly sectionText: string;
    readonly label: string;
    readonly navEnabled: boolean;
    readonly modePanel: string;
  };

  export type ActiveToolSections = Record<string, string>;

  export function sectionsForTab(
    panels: readonly ToolPanelSnapshot[],
    tab: string
  ): ToolSection[] {
    const seen = new Set<string>();
    const sections: ToolSection[] = [];
    for (const panel of panels) {
      if (panel.tab !== tab || !panel.navEnabled) continue;
      for (const section of splitSections(panel.sectionText)) {
        if (seen.has(section)) continue;
        seen.add(section);
        sections.push({ section, label: panel.label || section });
      }
    }
    return sections;
  }

  export function ensureActiveSection(
    tab: string,
    sections: readonly ToolSection[],
    activeSections: ActiveToolSections
  ): string {
    if (!sections.length) return "";
    const current = activeSections[tab];
    if (!sections.some((item) => item.section === current)) {
      activeSections[tab] = sections[0].section;
    }
    return activeSections[tab] || "";
  }

  export function navigationHtml(sections: readonly ToolSection[], activeSection: string): string {
    return sections.map((item) => {
      const active = item.section === activeSection ? "active" : "";
      return `<button type="button" class="${active}" data-tool-section-jump="${escapeHtml(item.section)}">${escapeHtml(item.label)}</button>`;
    }).join("");
  }

  export function panelMatchesActiveSection(
    panel: ToolPanelSnapshot,
    activeTab: string,
    activeSection: string,
    activeMode: string
  ): boolean {
    if (panel.tab !== activeTab) return false;
    const panelSections = splitSections(panel.sectionText);
    if (panelSections.length && !panelSections.includes(activeSection)) return false;
    if (panel.modePanel && panel.modePanel !== activeMode) return false;
    return true;
  }

  export function nextSection(
    sections: readonly ToolSection[],
    activeSection: string,
    direction: number
  ): string {
    if (!sections.length) return "";
    const foundIndex = sections.findIndex((item) => item.section === activeSection);
    const activeIndex = foundIndex >= 0 ? foundIndex : 0;
    const nextIndex = (activeIndex + direction + sections.length) % sections.length;
    const next = sections[nextIndex];
    return next ? next.section : "";
  }

  export function pageScrollMode(width: number, height: number): boolean {
    return width <= 1120 || height <= 820;
  }

  function splitSections(value: string): string[] {
    return String(value || "").split(/\s+/).filter(Boolean);
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
