import { useEffect, useMemo, useRef, useState } from "react";
import JSONEditor, { type JSONEditorOptions } from "jsoneditor";
import "jsoneditor/dist/jsoneditor.css";
import {
  decodeSaveText,
  encodeSaveText,
  fromJsonFriendly,
  toJsonFriendly,
  type DecodedSave
} from "./codec";
import {
  analyzePrisonGuards,
  hasBlockingPrisonRisk,
  repairPrisonGuards,
  type PrisonGuardCheck,
  type PrisonGuardReport
} from "./prisonGuards";
import SimpleEditor, { type GameDataIndex } from "./SimpleEditor";

type EditorMode = "json" | "simple";

function stripExt(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function createDownload(content: string, fileName: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readPath(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record || !(key in record)) return undefined;
    current = record[key];
  }
  return current;
}

function describe(value: unknown): string {
  if (value === undefined) return "-";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function severityText(check: PrisonGuardCheck): string {
  if (check.severity === "danger") return "命中";
  if (check.severity === "warning") return "提示";
  return "通过";
}

export default function App() {
  const [status, setStatus] = useState("就绪");
  const [error, setError] = useState("");
  const [loadedName, setLoadedName] = useState("file1.rpgsave");
  const [decoded, setDecoded] = useState<DecodedSave | null>(null);
  const [jsonName, setJsonName] = useState("file1.json");
  const [prisonReport, setPrisonReport] = useState<PrisonGuardReport | null>(null);
  const [showGuardDetails, setShowGuardDetails] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("json");
  const [currentValue, setCurrentValue] = useState<unknown | null>(null);
  const [gameDataIndex, setGameDataIndex] = useState<GameDataIndex | null>(null);

  const saveFileRef = useRef<HTMLInputElement | null>(null);
  const jsonFileRef = useRef<HTMLInputElement | null>(null);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<JSONEditor | null>(null);
  const guardCloseRef = useRef<HTMLButtonElement | null>(null);

  const outputSaveName = useMemo(() => {
    const source = decoded ? loadedName : jsonName;
    return `${stripExt(source)}.edited.rpgsave`;
  }, [decoded, jsonName, loadedName]);
  const outputJsonName = useMemo(() => `${stripExt(loadedName)}.json`, [loadedName]);

  const quickInfo = useMemo(() => {
    const value = currentValue ?? decoded?.value ?? null;
    return {
      gold: readPath(value, ["party", "_gold"]),
      mapId: readPath(value, ["map", "_mapId"]),
      playerX: readPath(value, ["player", "_x"]),
      playerY: readPath(value, ["player", "_y"]),
      saveCount: readPath(value, ["system", "_saveCount"])
    };
  }, [currentValue, decoded]);

  useEffect(() => {
    if (!editorHostRef.current) return;
    const options: JSONEditorOptions = {
      mode: "tree",
      modes: ["tree", "view", "form", "code", "text"],
      language: "zh-CN",
      mainMenuBar: true,
      navigationBar: true,
      statusBar: true,
      onError: (value: Error) => setError(value.message)
    };
    const editor = new JSONEditor(editorHostRef.current, options, {});
    editorRef.current = editor;
    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/game-data-index.json")
      .then((response): Promise<GameDataIndex | null> => {
        const contentType = response.headers.get("content-type") || "";
        if (response.status === 404 || !contentType.includes("application/json")) return Promise.resolve(null);
        if (!response.ok) throw new Error(`字段索引读取失败：${response.status}`);
        return response.json() as Promise<GameDataIndex>;
      })
      .then((value) => {
        if (!cancelled && value) setGameDataIndex(value);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showGuardDetails) return;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    guardCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowGuardDetails(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      activeElement?.focus();
    };
  }, [showGuardDetails]);

  function setEditorValue(value: unknown): void {
    if (!editorRef.current) throw new Error("编辑器尚未初始化。");
    editorRef.current.set(value as never);
  }

  function getEditorValue(): unknown {
    if (!editorRef.current) throw new Error("编辑器尚未初始化。");
    return editorRef.current.get();
  }

  function getWorkingValue(): unknown {
    if (editorMode === "json") return getEditorValue();
    if (currentValue == null) throw new Error("还没有打开存档。");
    return currentValue;
  }

  function applyWorkingValue(value: unknown, message: string): void {
    setCurrentValue(value);
    setEditorValue(value);
    setPrisonReport(analyzePrisonGuards(fromJsonFriendly(value)));
    setStatus(message);
  }

  function handleModeChange(nextMode: EditorMode): void {
    try {
      setError("");
      if (nextMode === "simple") {
        const value = getEditorValue();
        fromJsonFriendly(value);
        setCurrentValue(value);
        setPrisonReport(analyzePrisonGuards(fromJsonFriendly(value)));
      } else if (currentValue != null) {
        setEditorValue(currentValue);
      }
      setEditorMode(nextMode);
      setStatus(nextMode === "simple" ? "简易编辑" : "标准编辑");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("切换失败");
    }
  }

  async function handleSaveLoad(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setError("");
      setStatus("解码中");
      const text = await file.text();
      const result = await decodeSaveText(text);
      setLoadedName(file.name);
      setJsonName(`${stripExt(file.name)}.json`);
      setDecoded(result);
      const editorValue = toJsonFriendly(result.value);
      setEditorValue(editorValue);
      setCurrentValue(editorValue);
      setPrisonReport(analyzePrisonGuards(editorValue));
      setStatus(`已打开 ${file.name}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("打开失败");
    } finally {
      event.target.value = "";
    }
  }

  async function handleJsonLoad(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setError("");
      const text = await file.text();
      const value = JSON.parse(text);
      setEditorValue(value);
      setCurrentValue(value);
      setJsonName(file.name);
      setLoadedName(`${stripExt(file.name)}.rpgsave`);
      setDecoded(null);
      setPrisonReport(analyzePrisonGuards(value));
      setStatus(`已载入 ${file.name}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("载入失败");
    } finally {
      event.target.value = "";
    }
  }

  async function handleExportSave(): Promise<void> {
    try {
      setError("");
      const restored = fromJsonFriendly(getWorkingValue());
      const report = analyzePrisonGuards(restored);
      setPrisonReport(report);
      if (hasBlockingPrisonRisk(report)) {
        throw new Error(`导出已拦截：发现 ${report.hits.length} 项小黑屋硬风险。请先点“一键修复”或手动调低风险值。`);
      }
      const text = await encodeSaveText(restored, decoded?.parts);
      createDownload(text, outputSaveName);
      setStatus(`已导出 ${outputSaveName}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus(message.includes("导出已拦截") ? "已拦截" : "导出失败");
    }
  }

  function handleExportJson(): void {
    try {
      setError("");
      createDownload(JSON.stringify(getWorkingValue(), null, 2), jsonName || outputJsonName, "application/json;charset=utf-8");
      setStatus(`已导出 ${jsonName || outputJsonName}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("导出失败");
    }
  }

  function handleValidate(): void {
    try {
      setError("");
      const value = getWorkingValue();
      fromJsonFriendly(value);
      setCurrentValue(value);
      setStatus("JSON 有效");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("校验失败");
    }
  }

  function handleRefreshPrisonGuards(): void {
    try {
      setError("");
      const value = fromJsonFriendly(getWorkingValue());
      const report = analyzePrisonGuards(value);
      setPrisonReport(report);
      setStatus(report.hits.length ? `发现 ${report.hits.length} 项风险` : "小黑屋检查通过");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("检查失败");
    }
  }

  function handleRepairPrisonGuards(): void {
    try {
      setError("");
      const value = fromJsonFriendly(getWorkingValue());
      const result = repairPrisonGuards(value);
      const editorValue = toJsonFriendly(result.value);
      setEditorValue(editorValue);
      setCurrentValue(editorValue);
      setPrisonReport(analyzePrisonGuards(result.value));
      setStatus(result.fixed.length ? `已修复 ${result.fixed.length} 项风险` : "无需修复");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("修复失败");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">NATIVE RPGSAVE JSON</div>
          <h1>梦魇：无归 存档编辑器</h1>
        </div>
        <div className="top-actions">
          <div className={error ? "status status-error" : "status"} aria-live="polite">{status}</div>
          <div className="mode-toggle" role="tablist" aria-label="编辑模式">
            <button className={editorMode === "json" ? "active" : ""} onClick={() => handleModeChange("json")}>标准</button>
            <button className={editorMode === "simple" ? "active" : ""} onClick={() => handleModeChange("simple")}>简易</button>
          </div>
          <button className="primary" onClick={() => saveFileRef.current?.click()}>打开存档</button>
          <button onClick={() => jsonFileRef.current?.click()}>打开 JSON</button>
          <button onClick={handleExportJson}>导出 JSON</button>
          <button onClick={() => void handleExportSave()}>导出存档</button>
        </div>
      </header>

      <main className="layout">
        <aside className="side-panel">
          <section className="panel">
            <div className="panel-title">文件</div>
            <dl className="meta-list">
              <div><dt>存档</dt><dd>{loadedName}</dd></div>
              <div><dt>格式</dt><dd>{decoded?.kind ?? "JSON"}</dd></div>
              <div><dt>Payload</dt><dd>{decoded ? decoded.payloadLength.toLocaleString() : "-"}</dd></div>
              <div><dt>JSON</dt><dd>{decoded ? formatBytes(decoded.jsonLength) : "-"}</dd></div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel-title">当前摘要</div>
            <dl className="meta-list">
              <div><dt>金币</dt><dd>{describe(quickInfo.gold)}</dd></div>
              <div><dt>地图</dt><dd>{describe(quickInfo.mapId)}</dd></div>
              <div><dt>坐标</dt><dd>{describe(quickInfo.playerX)}, {describe(quickInfo.playerY)}</dd></div>
              <div><dt>保存次数</dt><dd>{describe(quickInfo.saveCount)}</dd></div>
            </dl>
          </section>

          <section className="panel control-panel">
            <div className="panel-title">常用位置</div>
            <dl className="meta-list path-list">
              <div><dt>金币</dt><dd>party._gold</dd></div>
              <div><dt>变量</dt><dd>variables._data.@a</dd></div>
              <div><dt>开关</dt><dd>switches._data.@a</dd></div>
              <div><dt>角色</dt><dd>actors._data.@a</dd></div>
              <div><dt>背包</dt><dd>party._items / _weapons / _armors</dd></div>
            </dl>
            <div className="button-grid">
              <button onClick={handleValidate}>校验</button>
              <button onClick={() => editorRef.current?.expandAll()}>展开</button>
              <button onClick={() => editorRef.current?.collapseAll()}>收起</button>
            </div>
          </section>

          <section className="panel guard-panel">
            <div className="panel-title">小黑屋护栏</div>
            <div className={
              prisonReport?.hits.length
                ? "guard-summary guard-danger"
                : prisonReport
                  ? "guard-summary guard-ok"
                  : "guard-summary"
            }>
              {prisonReport
                ? prisonReport.hits.length
                  ? `${prisonReport.hits.length} 项硬风险`
                  : "已知硬阈值通过"
                : "未检查"}
            </div>
            {prisonReport && (
              <div className="guard-metrics" aria-label="小黑屋检测统计">
                <div><span>硬风险</span><strong>{prisonReport.hits.length}</strong></div>
                <div><span>提示</span><strong>{prisonReport.warnings.length}</strong></div>
                <div><span>总规则</span><strong>{prisonReport.checks.length}</strong></div>
              </div>
            )}
            <div className="button-grid guard-actions">
              <button onClick={handleRefreshPrisonGuards}>刷新检测</button>
              <button className="primary" onClick={handleRepairPrisonGuards}>一键修复</button>
              <button onClick={() => setShowGuardDetails(true)} disabled={!prisonReport}>检测清单</button>
            </div>
            {prisonReport && (
              <div className="guard-list">
                {prisonReport.checks
                  .filter((check) => check.severity !== "ok")
                  .map((check) => (
                    <div key={check.id} className={`guard-item ${check.severity}`}>
                      <strong>{check.label}</strong>
                      <span>{check.value} / {check.limit}</span>
                      <small>{check.path}</small>
                      {check.note && <small>{check.note}</small>}
                    </div>
                  ))}
                {!prisonReport.hits.length && (
                  <div className="guard-item ok">
                    <strong>硬风险</strong>
                    <span>无命中</span>
                    <small>导出前仍会重新检查</small>
                  </div>
                )}
              </div>
            )}
          </section>

          {error && <section className="panel error-panel">{error}</section>}
        </aside>

        <section className="editor-panel">
          <div className={editorMode === "json" ? "editor-mode active" : "editor-mode hidden"}>
            <div ref={editorHostRef} className="editor-host" />
          </div>
          {editorMode === "simple" && (
            <SimpleEditor
              value={currentValue}
              dataIndex={gameDataIndex}
              onChange={applyWorkingValue}
            />
          )}
        </section>
      </main>

      <input ref={saveFileRef} type="file" accept=".rpgsave,.txt" hidden onChange={(event) => void handleSaveLoad(event)} />
      <input ref={jsonFileRef} type="file" accept=".json" hidden onChange={(event) => void handleJsonLoad(event)} />

      {showGuardDetails && prisonReport && (
        <div className="guard-modal-backdrop" role="presentation" onMouseDown={() => setShowGuardDetails(false)}>
          <section
            className="guard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guard-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="guard-modal-header">
              <div>
                <div className="eyebrow">PRISON CHECKS</div>
                <h2 id="guard-modal-title">小黑屋检测清单</h2>
              </div>
              <button ref={guardCloseRef} onClick={() => setShowGuardDetails(false)}>关闭</button>
            </header>
            <div className="guard-modal-summary">
              <span>命中 {prisonReport.hits.length}</span>
              <span>提示 {prisonReport.warnings.length}</span>
              <span>位置 Map{prisonReport.mapId ?? "-"} ({prisonReport.playerX ?? "-"}, {prisonReport.playerY ?? "-"})</span>
            </div>
            <div className="guard-table-wrap">
              <table className="guard-table">
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>分组</th>
                    <th>检测项</th>
                    <th>当前值</th>
                    <th>安全条件</th>
                    <th>触发后</th>
                    <th>路径</th>
                  </tr>
                </thead>
                <tbody>
                  {prisonReport.checks.map((check) => (
                    <tr key={check.id} className={`guard-row ${check.severity}`}>
                      <td><span className={`severity-pill ${check.severity}`}>{severityText(check)}</span></td>
                      <td>{check.group}</td>
                      <td>
                        <strong>{check.label}</strong>
                        {check.note && <small>{check.note}</small>}
                      </td>
                      <td>{check.value}</td>
                      <td>{check.limit}</td>
                      <td>{check.effect}</td>
                      <td><code>{check.path}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
