namespace NwrGuiRuntimeEvents {
  export type TimeFormatter = (ts: number) => string;

  type JsonRecord = { readonly [key: string]: unknown };

  export function eventListHtml(events: readonly unknown[], formatTime: TimeFormatter = defaultTime): string {
    const latest = events.slice(-40).reverse();
    if (latest.length === 0) {
      return '<div class="event"><div class="event-time">--:--</div><div class="event-body">暂无事件</div></div>';
    }
    return latest.map((event) => eventHtml(event, formatTime)).join("");
  }

  function eventHtml(value: unknown, formatTime: TimeFormatter): string {
    const event = record(value) || {};
    const ts = Number(event.ts || Date.now());
    const ok = event.ok !== false;
    const type = textOr(event.type, "event");
    const payload = event.payload ? JSON.stringify(event.payload) : "";
    return `<div class="event ${ok ? "" : "fail"}"><div class="event-time">${escapeHtml(formatTime(ts))}</div><div class="event-body">${escapeHtml(type)} ${ok ? "OK" : "FAIL"} ${escapeHtml(payload)}</div></div>`;
  }

  function defaultTime(ts: number): string {
    return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
  }

  function textOr(value: unknown, fallback: string): string {
    return value == null || value === "" ? fallback : String(value);
  }

  function record(value: unknown): JsonRecord | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
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
