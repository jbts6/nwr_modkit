var NwrGuiBridgeIO;
(function (NwrGuiBridgeIO) {
    function createBridgePaths(pathAdapter, projectRoot) {
        const bridgeDir = pathAdapter.join(projectRoot, "runtime", "bridge-state");
        return {
            bridgeDir,
            commandPath: pathAdapter.join(bridgeDir, "commands.jsonl"),
            eventPath: pathAdapter.join(bridgeDir, "events.jsonl"),
            statePath: pathAdapter.join(bridgeDir, "state.json")
        };
    }
    NwrGuiBridgeIO.createBridgePaths = createBridgePaths;
    function ensureBridgeDir(fsAdapter, paths) {
        fsAdapter.mkdirSync(paths.bridgeDir, { recursive: true });
    }
    NwrGuiBridgeIO.ensureBridgeDir = ensureBridgeDir;
    function sendCommand(fsAdapter, paths, command, now = Date.now, random = Math.random) {
        ensureBridgeDir(fsAdapter, paths);
        const payload = {
            ...command,
            commandId: `${now()}-${random().toString(16).slice(2)}`,
            ts: now()
        };
        fsAdapter.appendFileSync(paths.commandPath, `${JSON.stringify(payload)}\n`, "utf8");
        return payload;
    }
    NwrGuiBridgeIO.sendCommand = sendCommand;
    function clearEvents(fsAdapter, paths) {
        ensureBridgeDir(fsAdapter, paths);
        fsAdapter.writeFileSync(paths.eventPath, "", "utf8");
    }
    NwrGuiBridgeIO.clearEvents = clearEvents;
    function readEvents(fsAdapter, paths) {
        try {
            if (!fsAdapter.existsSync(paths.eventPath))
                return [];
            const text = fsAdapter.readFileSync(paths.eventPath, "utf8").trim();
            if (!text)
                return [];
            return text.split(/\r?\n/).flatMap((line) => {
                try {
                    return [JSON.parse(line)];
                }
                catch (error) {
                    if (error instanceof SyntaxError)
                        return [];
                    throw error;
                }
            });
        }
        catch (error) {
            if (error instanceof Error)
                return [];
            throw error;
        }
    }
    NwrGuiBridgeIO.readEvents = readEvents;
    function eventSize(fsAdapter, paths) {
        return fsAdapter.existsSync(paths.eventPath) ? fsAdapter.statSync(paths.eventPath).size : 0;
    }
    NwrGuiBridgeIO.eventSize = eventSize;
})(NwrGuiBridgeIO || (NwrGuiBridgeIO = {}));
var NwrGuiBridgeCommands;
(function (NwrGuiBridgeCommands) {
    NwrGuiBridgeCommands.ping = () => ({ type: "ping" });
    NwrGuiBridgeCommands.runtimeInspect = (targetPath) => ({ type: "runtime.inspect", path: targetPath });
    NwrGuiBridgeCommands.runtimeSearch = (query) => ({
        type: "runtime.search",
        keywords: Array.isArray(query)
            ? query.map((keyword) => String(keyword).trim()).filter(Boolean)
            : String(query || "").split(/\s+/).map((keyword) => keyword.trim()).filter(Boolean)
    });
    NwrGuiBridgeCommands.dataDump = (names, outputDir) => ({ type: "data.dump", names, outputDir });
    NwrGuiBridgeCommands.trainerOptionsGet = () => ({ type: "trainer.options.get" });
    NwrGuiBridgeCommands.trainerHooksInfo = () => ({ type: "trainer.hooks.info" });
    NwrGuiBridgeCommands.trainerOptionsSet = (options) => ({ type: "trainer.options.set", options });
    NwrGuiBridgeCommands.goldSet = (value) => ({ type: "gold.set", value });
    NwrGuiBridgeCommands.goldAdd = (amount) => ({ type: "gold.add", amount });
    NwrGuiBridgeCommands.variableSet = (id, value) => ({ type: "variable.set", id, value });
    NwrGuiBridgeCommands.switchSet = (id, value) => ({ type: "switch.set", id, value });
    NwrGuiBridgeCommands.itemAdd = (kind, id, amount) => ({ type: "item.add", kind, id, amount });
    NwrGuiBridgeCommands.actorUnlock = (id) => ({ type: "actor.unlock", id });
    NwrGuiBridgeCommands.actorAdd = (id) => ({ type: "actor.add", id });
    NwrGuiBridgeCommands.actorRemove = (id) => ({ type: "actor.remove", id });
    NwrGuiBridgeCommands.actorRecover = (id) => ({ type: "actor.recover", id });
    NwrGuiBridgeCommands.actorNameSet = (id, name) => ({ type: "actor.name.set", id, name });
    NwrGuiBridgeCommands.actorLevelSet = (id, level) => ({ type: "actor.level.set", id, level });
    NwrGuiBridgeCommands.actorExpAdd = (id, amount) => ({ type: "actor.exp.add", id, amount });
    NwrGuiBridgeCommands.actorVitalsSet = (id, hp, mp, tp) => ({ type: "actor.vitals.set", id, hp, mp, tp });
    NwrGuiBridgeCommands.actorParamAdd = (id, paramId, value) => ({ type: "actor.param.add", id, paramId, value });
    NwrGuiBridgeCommands.actorJpAdd = (id, amount, classId) => ({ type: "actor.jp.add", id, amount, classId });
    NwrGuiBridgeCommands.actorAllocationPointsAdd = (id, amount, classId) => ({
        type: "actor.allocationPoints.add",
        id,
        amount,
        classId
    });
    NwrGuiBridgeCommands.actorSkillLearn = (id, skillId) => ({ type: "actor.skill.learn", id, skillId });
    NwrGuiBridgeCommands.actorSkillForget = (id, skillId) => ({ type: "actor.skill.forget", id, skillId });
    NwrGuiBridgeCommands.battleKillEnemies = () => ({ type: "battle.killEnemies" });
    NwrGuiBridgeCommands.battleEscape = () => ({ type: "battle.escape" });
    NwrGuiBridgeCommands.partyRecover = () => ({ type: "party.recover" });
    NwrGuiBridgeCommands.prisonRepair = () => ({ type: "prison.repair" });
    NwrGuiBridgeCommands.mapCurrent = () => ({ type: "map.current" });
    NwrGuiBridgeCommands.mapTransfer = (mapId, x, y, direction, fade) => ({ type: "map.transfer", mapId, x, y, direction, fade });
    NwrGuiBridgeCommands.commonEventRun = (id) => ({ type: "commonEvent.run", id });
    NwrGuiBridgeCommands.save = (id) => ({ type: "save", id });
    NwrGuiBridgeCommands.titleRefresh = () => ({ type: "title.refresh" });
})(NwrGuiBridgeCommands || (NwrGuiBridgeCommands = {}));
var NwrGuiDiagnostics;
(function (NwrGuiDiagnostics) {
    NwrGuiDiagnostics.DIAGNOSTICS = [
        diagnostic("ping", "Ping", "ping"),
        diagnostic("runtime.inspect", "Runtime Inspect", "runtime.inspect"),
        diagnostic("runtime.search", "Runtime Search", "runtime.search"),
        diagnostic("trainer.options.get", "Trainer Options", "trainer.options.get"),
        diagnostic("trainer.hooks.info", "Trainer Hooks", "trainer.hooks.info"),
        diagnostic("data.dump", "Data Dump", "data.dump"),
        diagnostic("map.current", "Current Map", "map.current")
    ];
    function commandForDiagnostic(id) {
        switch (id) {
            case "ping":
                return NwrGuiBridgeCommands.ping();
            case "runtime.inspect":
                return NwrGuiBridgeCommands.runtimeInspect("SceneManager");
            case "runtime.search":
                return NwrGuiBridgeCommands.runtimeSearch("gold map save actor item switch variable");
            case "trainer.options.get":
                return NwrGuiBridgeCommands.trainerOptionsGet();
            case "trainer.hooks.info":
                return NwrGuiBridgeCommands.trainerHooksInfo();
            case "data.dump":
                return NwrGuiBridgeCommands.dataDump(["Actors", "Skills", "Items", "CommonEvents", "System", "MapInfos", "Enemies", "Troops"], "../.omo/evidence/gui-diagnostics-dump");
            case "map.current":
                return NwrGuiBridgeCommands.mapCurrent();
            default:
                return assertNever(id);
        }
    }
    NwrGuiDiagnostics.commandForDiagnostic = commandForDiagnostic;
    function diagnosticById(id) {
        return NwrGuiDiagnostics.DIAGNOSTICS.find((definition) => definition.id === id) || null;
    }
    NwrGuiDiagnostics.diagnosticById = diagnosticById;
    function diagnostic(id, label, commandType) {
        return {
            id,
            label,
            commandType,
            a1ControlId: `candidate:${commandType}`,
            mutates: false
        };
    }
    function assertNever(value) {
        throw new Error(`Unhandled diagnostic ${value}`);
    }
})(NwrGuiDiagnostics || (NwrGuiDiagnostics = {}));
var NwrGuiFeatureAudit;
(function (NwrGuiFeatureAudit) {
    NwrGuiFeatureAudit.PANEL_POLICIES = [
        keep("panel:core:gold"),
        keep("panel:misc:variable"),
        keep("panel:misc:switch"),
        keep("panel:catalog:item"),
        keep("panel:catalog:actor"),
        keep("panel:catalog:skill"),
        optimize("panel:core:prison", "live state report is read-only; repair button keeps command guardrail confirmation", ["ping"], ["a1-live-loaded-1781195358727-0"]),
        optimize("panel:world:map", "read-only lookup stays active; transfer keeps per-control guardrails", ["map.current", "ping"], ["a1-live-loaded-1781195358727-8", "a1-live-loaded-1781195358727-0"]),
        optimize("panel:world:commonEvent", "read-only lookup stays active; event run keeps per-control guardrails", ["data.dump", "runtime.search"], ["a1-live-loaded-1781195358727-7", "a1-live-loaded-1781195358727-2"]),
        optimize("panel:core:rate", "trainer option controls are live-backed; hook state remains visible in runtime status", ["trainer.hooks.info", "ping"], ["a1-live-loaded-1781195358727-3", "a1-live-loaded-1781195358727-0"]),
        optimize("panel:core:battle", "trainer toggle controls are live-backed; scene-specific battle commands keep per-control guardrails", ["trainer.hooks.info", "runtime.inspect"], ["a1-live-loaded-1781195358727-3", "a1-live-loaded-1781195358727-1"]),
        guard("panel:core:save", "save writes are intentionally guarded until an explicit save workflow is approved", ["runtime.inspect", "protocol handler inventory"], ["a1-live-loaded-1781195358727-1"]),
        guard("panel:debug:command", "custom JSON can send mutating commands; retain only with guardrails", ["ping"], ["a1-live-loaded-1781195358727-0"])
    ];
    function panelControlId(panel) {
        return `panel:${panel.tab}:${panel.sectionText}`;
    }
    NwrGuiFeatureAudit.panelControlId = panelControlId;
    function policyForPanel(panel) {
        const controlId = panelControlId(panel);
        return NwrGuiFeatureAudit.PANEL_POLICIES.find((policy) => policy.controlId === controlId) || null;
    }
    NwrGuiFeatureAudit.policyForPanel = policyForPanel;
    function panelIsVisible(panel) {
        return policyForPanel(panel)?.classification !== "delete";
    }
    NwrGuiFeatureAudit.panelIsVisible = panelIsVisible;
    function policyEvidenceText(policy) {
        if (!policy)
            return "";
        const commandText = policy.evidenceCommands.join(",");
        const eventText = policy.eventIds.join(",");
        return eventText ? `${commandText}; events=${eventText}` : commandText;
    }
    NwrGuiFeatureAudit.policyEvidenceText = policyEvidenceText;
    function applyPanelAuditState(panel, controls, policy) {
        if (!policy) {
            clearPanelAudit(panel);
            setControlsGuarded(controls, false);
            return;
        }
        const guarded = !policy.actionAllowed;
        panel.dataset.auditControlId = policy.controlId;
        panel.dataset.auditClassification = policy.classification;
        panel.dataset.auditActionAllowed = policy.actionAllowed ? "true" : "false";
        panel.dataset.auditEvidence = policyEvidenceText(policy);
        panel.dataset.auditGuarded = guarded ? "true" : "false";
        panel.classList.toggle("audit-guarded", guarded);
        if (guarded)
            panel.setAttribute("aria-disabled", "true");
        else
            panel.removeAttribute("aria-disabled");
        setControlsGuarded(controls, guarded);
    }
    NwrGuiFeatureAudit.applyPanelAuditState = applyPanelAuditState;
    function keep(controlId) {
        return {
            controlId,
            classification: "keep",
            actionAllowed: true,
            evidenceCommands: ["static inventory"],
            eventIds: [],
            rationale: "static GUI panel backed by inventory or local controls"
        };
    }
    function guard(controlId, rationale = "panel contains scene-dependent or mutating actions", evidenceCommands = ["static inventory"], eventIds = []) {
        return {
            controlId,
            classification: "disable-guard",
            actionAllowed: false,
            evidenceCommands,
            eventIds,
            rationale
        };
    }
    function optimize(controlId, rationale, evidenceCommands, eventIds) {
        return {
            controlId,
            classification: "optimize",
            actionAllowed: true,
            evidenceCommands,
            eventIds,
            rationale
        };
    }
    function clearPanelAudit(panel) {
        delete panel.dataset.auditControlId;
        delete panel.dataset.auditClassification;
        delete panel.dataset.auditActionAllowed;
        delete panel.dataset.auditEvidence;
        delete panel.dataset.auditGuarded;
        panel.classList.toggle("audit-guarded", false);
        panel.removeAttribute("aria-disabled");
    }
    function setControlsGuarded(controls, guarded) {
        controls.forEach((control) => {
            if (guarded) {
                control.disabled = true;
                control.dataset.auditDisabledByPolicy = "true";
                control.setAttribute("aria-disabled", "true");
                return;
            }
            if (control.dataset.auditDisabledByPolicy !== "true")
                return;
            control.disabled = false;
            delete control.dataset.auditDisabledByPolicy;
            control.removeAttribute("aria-disabled");
        });
    }
})(NwrGuiFeatureAudit || (NwrGuiFeatureAudit = {}));
var NwrGuiCommandGuardrails;
(function (NwrGuiCommandGuardrails) {
    const PING_EVENTS = ["a1-live-loaded-1781195358727-0"];
    const DATA_EVENTS = ["a1-live-loaded-1781195358727-7", "a1-live-loaded-1781195358727-0"];
    const HOOK_EVENTS = ["a1-live-loaded-1781195358727-3", "a1-live-loaded-1781195358727-0"];
    const BATTLE_EVENTS = ["a1-live-loaded-1781195358727-3", "a1-live-loaded-1781195358727-1"];
    const MAP_EVENTS = ["a1-live-loaded-1781195358727-8", "a1-live-loaded-1781195358727-0"];
    const COMMON_EVENT_EVENTS = ["a1-live-loaded-1781195358727-7", "a1-live-loaded-1781195358727-2"];
    NwrGuiCommandGuardrails.ACTION_GUARDRAILS = [
        action("goldSetBtn", "Set gold", "gold.set", "keep", ["ping"], PING_EVENTS),
        action("goldAddBtn", "Add gold", "gold.add", "keep", ["ping"], PING_EVENTS),
        action("selector:data-gold-add", "Gold quick add buttons", "gold.add", "keep", ["ping"], PING_EVENTS),
        action("selector:data-gold-set", "Gold MAX button", "gold.set", "keep", ["ping"], PING_EVENTS),
        action("variableSetBtn", "Write variable", "variable.set", "keep", ["ping"], PING_EVENTS),
        action("switchSetBtn", "Write switch", "switch.set", "keep", ["ping"], PING_EVENTS),
        action("itemAddBtn", "Add selected item", "item.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorUnlockBtn", "Unlock actor from active catalog", "actor.unlock", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorAddBtn", "Add actor to party", "actor.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorRemoveBtn", "Remove actor", "actor.remove", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorRecoverBtn", "Recover actor", "actor.recover", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorNameBtn", "Set actor name", "actor.name.set", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorLevelBtn", "Set actor level", "actor.level.set", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorExpBtn", "Add actor EXP", "actor.exp.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorVitalsBtn", "Write actor vitals", "actor.vitals.set", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorParamBtn", "Add actor parameter", "actor.param.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorSpBtn", "Add actor SP", "actor.jp.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("actorAllocationPointsBtn", "Add actor attribute points", "actor.allocationPoints.add", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("skillLearnBtn", "Learn actor skill", "actor.skill.learn", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("skillForgetBtn", "Forget actor skill", "actor.skill.forget", "keep", ["data.dump", "ping"], DATA_EVENTS),
        action("ratesApplyBtn", "Apply trainer rates", "trainer.options.set", "optimize", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
        action("selector:data-rate", "Trainer rate presets", "trainer.options.set", "optimize", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
        action("noCostBtn", "Toggle no skill cost", "trainer.options.set", "disable-guard", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
        action("oneHitKillBtn", "Toggle one hit kill", "trainer.options.set", "disable-guard", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
        action("invincibleBtn", "Toggle invincible", "trainer.options.set", "disable-guard", ["trainer.hooks.info", "ping"], HOOK_EVENTS),
        action("battleKillBtn", "Kill battle enemies", "battle.killEnemies", "disable-guard", ["trainer.hooks.info", "runtime.inspect"], BATTLE_EVENTS),
        action("battleEscapeBtn", "Battle escape", "battle.escape", "disable-guard", ["trainer.hooks.info", "runtime.inspect"], BATTLE_EVENTS),
        action("partyRecoverBtn", "Recover party", "party.recover", "keep", ["ping"], PING_EVENTS),
        action("prisonRepairBtn", "Repair prison guard risks", "prison.repair", "disable-guard", ["protocol handler inventory", "ping"], PING_EVENTS),
        action("mapTransferBtn", "Transfer map", "map.transfer", "disable-guard", ["map.current", "ping"], MAP_EVENTS),
        action("returnPositionBtn", "Return recorded position", "map.transfer", "disable-guard", ["map.current", "ping"], MAP_EVENTS),
        action("commonEventRunBtn", "Run common event", "commonEvent.run", "disable-guard", ["data.dump", "runtime.search"], COMMON_EVENT_EVENTS),
        action("saveGameBtn", "Save game", "save", "disable-guard", ["protocol handler inventory"], []),
        action("titleRefreshBtn", "Refresh title", "title.refresh", "keep", ["protocol handler inventory"], []),
        action("customSendBtn", "Send custom JSON command", "custom", "disable-guard", ["static inventory", "ping"], PING_EVENTS)
    ];
    function guardFor(commandType, controlId = "") {
        const direct = controlId ? NwrGuiCommandGuardrails.ACTION_GUARDRAILS.find((guardrail) => guardrail.controlId === controlId) : null;
        if (direct)
            return direct;
        return NwrGuiCommandGuardrails.ACTION_GUARDRAILS.find((guardrail) => guardrail.commandType === commandType) || null;
    }
    NwrGuiCommandGuardrails.guardFor = guardFor;
    function panelGuardText(policy) {
        const evidence = NwrGuiFeatureAudit.policyEvidenceText(policy);
        return `A1 ${policy.classification}: ${policy.rationale}. ${evidence}`;
    }
    NwrGuiCommandGuardrails.panelGuardText = panelGuardText;
    function action(controlId, label, commandType, classification, evidenceCommands, eventIds) {
        return { controlId, label, commandType, classification, evidenceCommands, eventIds };
    }
})(NwrGuiCommandGuardrails || (NwrGuiCommandGuardrails = {}));
var NwrGuiToolNavigation;
(function (NwrGuiToolNavigation) {
    function sectionsForTab(panels, tab) {
        const seen = new Set();
        const sections = [];
        for (const panel of panels) {
            if (panel.tab !== tab || !panel.navEnabled)
                continue;
            for (const section of splitSections(panel.sectionText)) {
                if (seen.has(section))
                    continue;
                seen.add(section);
                sections.push({ section, label: panel.label || section });
            }
        }
        return sections;
    }
    NwrGuiToolNavigation.sectionsForTab = sectionsForTab;
    function ensureActiveSection(tab, sections, activeSections) {
        if (!sections.length)
            return "";
        const current = activeSections[tab];
        if (!sections.some((item) => item.section === current)) {
            activeSections[tab] = sections[0].section;
        }
        return activeSections[tab] || "";
    }
    NwrGuiToolNavigation.ensureActiveSection = ensureActiveSection;
    function navigationHtml(sections, activeSection) {
        return sections.map((item) => {
            const active = item.section === activeSection ? "active" : "";
            return `<button type="button" class="${active}" data-tool-section-jump="${escapeHtml(item.section)}">${escapeHtml(item.label)}</button>`;
        }).join("");
    }
    NwrGuiToolNavigation.navigationHtml = navigationHtml;
    function panelMatchesActiveSection(panel, activeTab, activeSection, activeMode) {
        if (panel.tab !== activeTab)
            return false;
        const panelSections = splitSections(panel.sectionText);
        if (panelSections.length && !panelSections.includes(activeSection))
            return false;
        if (panel.modePanel && panel.modePanel !== activeMode)
            return false;
        return true;
    }
    NwrGuiToolNavigation.panelMatchesActiveSection = panelMatchesActiveSection;
    function nextSection(sections, activeSection, direction) {
        if (!sections.length)
            return "";
        const foundIndex = sections.findIndex((item) => item.section === activeSection);
        const activeIndex = foundIndex >= 0 ? foundIndex : 0;
        const nextIndex = (activeIndex + direction + sections.length) % sections.length;
        const next = sections[nextIndex];
        return next ? next.section : "";
    }
    NwrGuiToolNavigation.nextSection = nextSection;
    function pageScrollMode(width, height) {
        return width <= 1120 || height <= 820;
    }
    NwrGuiToolNavigation.pageScrollMode = pageScrollMode;
    function splitSections(value) {
        return String(value || "").split(/\s+/).filter(Boolean);
    }
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})(NwrGuiToolNavigation || (NwrGuiToolNavigation = {}));
var NwrGuiPrisonGuards;
(function (NwrGuiPrisonGuards) {
    function reportFromState(state) {
        return parseReport(record(state)?.prisonGuardReport);
    }
    NwrGuiPrisonGuards.reportFromState = reportFromState;
    function applyPanel(elements, report, live) {
        const level = summaryLevel(report, live);
        elements.summary.className = `prison-summary prison-${level}`;
        elements.summary.textContent = summaryText(report, live);
        elements.metrics.innerHTML = metricsHtml(report, live);
        elements.list.innerHTML = listHtml(report, live);
        const canRepair = live && !!report && report.hits.some((check) => check.fixable);
        elements.repairButton.disabled = !canRepair;
        elements.repairButton.title = canRepair
            ? "修复数值、关键物品和 Switch520；不会处理运行时 param(9) 提示"
            : "没有可自动修复的硬风险";
    }
    NwrGuiPrisonGuards.applyPanel = applyPanel;
    function summaryLevel(report, live) {
        if (!live || !report)
            return "idle";
        if (report.hits.length > 0)
            return "danger";
        if (report.warnings.length > 0)
            return "warning";
        return "ok";
    }
    function summaryText(report, live) {
        if (!report)
            return "等待运行时检测";
        if (!live)
            return "状态过期，等待刷新";
        if (report.hits.length > 0)
            return `${report.hits.length} 项硬风险`;
        if (report.warnings.length > 0)
            return `${report.warnings.length} 项提示`;
        return "检查通过";
    }
    function metricsHtml(report, live) {
        const hits = report ? report.hits.length : 0;
        const warnings = report ? report.warnings.length : 0;
        const switchText = report?.punishmentSwitch ? "ON" : "OFF";
        const mapText = report?.mapId == null ? "-" : `${report.mapId} (${report.playerX ?? "-"}, ${report.playerY ?? "-"})`;
        return [
            metric("硬风险", hits),
            metric("提示", warnings),
            metric("Switch520", live && report ? switchText : "-"),
            metric("位置", live && report ? mapText : "-")
        ].join("");
    }
    function listHtml(report, live) {
        if (!report)
            return `<div class="prison-empty">bridge 连接后自动检测。</div>`;
        const visible = [...report.hits, ...report.warnings];
        if (visible.length === 0)
            return `<div class="prison-empty">${live ? "未发现硬风险。" : "上次检测未发现硬风险。"}</div>`;
        return visible.map(checkHtml).join("");
    }
    function checkHtml(check) {
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
    function metric(label, value) {
        return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
    }
    function parseReport(value) {
        const row = record(value);
        if (!row)
            return null;
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
    function parseCheck(value) {
        const row = record(value);
        if (!row)
            return [];
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
    function severity(value) {
        if (value === "danger")
            return "danger";
        if (value === "warning")
            return "warning";
        return "ok";
    }
    function array(value) {
        return Array.isArray(value) ? value : [];
    }
    function text(value) {
        return value == null ? "" : String(value);
    }
    function nullableNumber(value) {
        return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    function record(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
    function escapeHtml(value) {
        return value.replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        }[char] || char));
    }
})(NwrGuiPrisonGuards || (NwrGuiPrisonGuards = {}));
var NwrGuiRuntimeState;
(function (NwrGuiRuntimeState) {
    function renderState(state, options) {
        return stateView(state, options);
    }
    NwrGuiRuntimeState.renderState = renderState;
    function stateView(state, options) {
        const row = record(state);
        if (!row)
            return emptyView();
        const now = options.now == null ? Date.now() : options.now;
        const age = now - Number(row.ts || 0);
        const fresh = age >= 0 && age < 5000;
        const version = textOr(row.bridgeVersion, "?");
        const versionOk = version === options.expectedBridgeVersion;
        const hasParty = !!row.hasParty;
        const status = statusFor({ fresh, versionOk, hasParty, lastError: row.lastError });
        return {
            hasState: true,
            fresh,
            version,
            versionOk,
            hasParty,
            status,
            bridgeText: bridgeText(row, fresh, version, versionOk, options.expectedBridgeVersion),
            partyState: hasParty ? "可用" : "未就绪",
            goldState: row.gold,
            goldMetric: row.gold || 0,
            saveState: row.saveDirExists ? "已识别" : "缺失",
            mapState: mapText(record(row.currentMap)),
            saveFiles: stringArray(row.saveFiles),
            partyMembers: partyMemberViews(row.partyMembers)
        };
    }
    NwrGuiRuntimeState.stateView = stateView;
    function statusFor(input) {
        if (!input.fresh)
            return status("idle", "离线");
        if (!input.versionOk)
            return status("error", "需重启");
        if (input.lastError)
            return status("error", "有错误");
        if (input.hasParty)
            return status("online", "已连接");
        return status("idle", "加载中");
    }
    NwrGuiRuntimeState.statusFor = statusFor;
    function emptyView() {
        return {
            hasState: false,
            fresh: false,
            version: "?",
            versionOk: false,
            hasParty: false,
            status: status("idle", "未连接"),
            bridgeText: "等待 bridge",
            partyState: "-",
            goldState: "-",
            goldMetric: 0,
            saveState: "-",
            mapState: "-",
            saveFiles: [],
            partyMembers: []
        };
    }
    function status(kind, text) {
        return { kind, text, className: `status status-${kind}` };
    }
    function bridgeText(state, fresh, version, versionOk, expectedBridgeVersion) {
        if (!fresh)
            return "上次状态";
        const prefix = state.storagePatched ? "已接入" : "已注入";
        return `${prefix} v${version}${versionOk ? "" : ` -> v${expectedBridgeVersion}`}`;
    }
    function mapText(map) {
        if (!map || !map.mapId)
            return "-";
        return `${map.mapId} (${map.x ?? "-"}, ${map.y ?? "-"})`;
    }
    function partyMemberViews(value) {
        if (!Array.isArray(value))
            return [];
        return value.flatMap((item) => {
            const actor = record(item);
            if (!actor)
                return [];
            return [{
                    id: textOr(actor.id, ""),
                    name: textOr(actor.name, ""),
                    vitals: `Lv.${textOr(actor.level, "-")} HP ${textOr(actor.hp, "-")}/${textOr(actor.mhp, "-")} MP ${textOr(actor.mp, "-")}/${textOr(actor.mmp, "-")} 职${textOr(actor.classId, "-")} SP ${textOr(actor.jp, "-")} 属性点 ${textOr(actor.allocationPoints, "-")}`
                }];
        });
    }
    function stringArray(value) {
        return Array.isArray(value) ? value.map((item) => String(item)) : [];
    }
    function textOr(value, fallback) {
        return value == null || value === "" ? fallback : String(value);
    }
    function record(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
})(NwrGuiRuntimeState || (NwrGuiRuntimeState = {}));
var NwrGuiRuntimeEvents;
(function (NwrGuiRuntimeEvents) {
    function eventListHtml(events, formatTime = defaultTime) {
        const latest = events.slice(-40).reverse();
        if (latest.length === 0) {
            return '<div class="event"><div class="event-time">--:--</div><div class="event-body">暂无事件</div></div>';
        }
        return latest.map((event) => eventHtml(event, formatTime)).join("");
    }
    NwrGuiRuntimeEvents.eventListHtml = eventListHtml;
    function eventHtml(value, formatTime) {
        const event = record(value) || {};
        const ts = Number(event.ts || Date.now());
        const ok = event.ok !== false;
        const type = textOr(event.type, "event");
        const payload = event.payload ? JSON.stringify(event.payload) : "";
        return `<div class="event ${ok ? "" : "fail"}"><div class="event-time">${escapeHtml(formatTime(ts))}</div><div class="event-body">${escapeHtml(type)} ${ok ? "OK" : "FAIL"} ${escapeHtml(payload)}</div></div>`;
    }
    function defaultTime(ts) {
        return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
    }
    function textOr(value, fallback) {
        return value == null || value === "" ? fallback : String(value);
    }
    function record(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})(NwrGuiRuntimeEvents || (NwrGuiRuntimeEvents = {}));
var NwrGuiRuntimeRoutes;
(function (NwrGuiRuntimeRoutes) {
    const ROUTES = [
        {
            name: "manual-bg-bridge",
            label: "Prepare manual bridge game",
            default: true,
            powershellSwitches: ["-BgBridgeManual"],
            launcher: "launch-bg-bridge-runtime.ps1",
            riskNote: "手动 bridge：准备 runtime/game-app/start-manual-bg-bridge.cmd，然后用“打开游戏”启动生成目录。准备阶段不修改根目录 package.json 或 www 文件，也不会启动根目录 Game.exe；普通根目录 Game.exe 已运行时无法后附加。"
        }
    ];
    function routeOptions() {
        return ROUTES.slice();
    }
    NwrGuiRuntimeRoutes.routeOptions = routeOptions;
    function defaultRouteName() {
        const route = ROUTES.find((item) => item.default);
        return route ? route.name : "manual-bg-bridge";
    }
    NwrGuiRuntimeRoutes.defaultRouteName = defaultRouteName;
    function normalizeRouteName(value) {
        const route = ROUTES.find((item) => item.name === value);
        return route ? route.name : defaultRouteName();
    }
    NwrGuiRuntimeRoutes.normalizeRouteName = normalizeRouteName;
    function routeOption(name) {
        const routeName = normalizeRouteName(name);
        const route = ROUTES.find((item) => item.name === routeName);
        return route || ROUTES[0];
    }
    NwrGuiRuntimeRoutes.routeOption = routeOption;
    function launchArguments(baseArgs, name) {
        return [...baseArgs, ...routeOption(name).powershellSwitches];
    }
    NwrGuiRuntimeRoutes.launchArguments = launchArguments;
    function diagnosticModel(name) {
        const route = routeOption(name);
        return {
            routeName: route.name,
            label: route.label,
            launcher: route.launcher,
            switchText: route.powershellSwitches.length ? route.powershellSwitches.join(" ") : "(none)",
            riskNote: route.riskNote
        };
    }
    NwrGuiRuntimeRoutes.diagnosticModel = diagnosticModel;
})(NwrGuiRuntimeRoutes || (NwrGuiRuntimeRoutes = {}));
var NwrGuiCatalog;
(function (NwrGuiCatalog) {
    NwrGuiCatalog.CATALOG_ROW_HEIGHT = 88;
    NwrGuiCatalog.CATALOG_PAGE_SIZE = 20;
    NwrGuiCatalog.DATALIST_LIMIT = 80;
    NwrGuiCatalog.ITEM_KIND_LABELS = {
        item: "物品",
        weapon: "武器",
        armor: "防具"
    };
    function cleanText(value) {
        return String(value == null ? "" : value)
            .replace(/\\[A-Z]+\[[^\]]*\]/gi, "")
            .replace(/\s+/g, " ")
            .trim();
    }
    NwrGuiCatalog.cleanText = cleanText;
    function cleanNote(value) {
        return cleanText(value)
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    NwrGuiCatalog.cleanNote = cleanNote;
    function makeSearchText(parts) {
        return parts
            .filter((part) => part != null && part !== "")
            .map((part) => String(part))
            .join(" ")
            .toLowerCase();
    }
    NwrGuiCatalog.makeSearchText = makeSearchText;
    function catalogName(catalogs, kind, id) {
        const item = catalogEntry(catalogs, kind, id);
        return item ? item.name : "";
    }
    NwrGuiCatalog.catalogName = catalogName;
    function catalogEntry(catalogs, kind, id) {
        const list = catalogs[kind] || [];
        const textId = String(id);
        const numberId = Number(id);
        return list.find((entry) => {
            if (kind === "all")
                return entry.uid === textId || entry.id === numberId;
            return entry.id === numberId;
        }) || null;
    }
    NwrGuiCatalog.catalogEntry = catalogEntry;
    function filterDatalistEntries(entries, query, limit) {
        const needle = String(query || "").trim().toLowerCase();
        const result = [];
        for (const entry of entries) {
            if (needle && !entryMatchesSearch(entry, needle))
                continue;
            result.push(entry);
            if (result.length >= limit)
                break;
        }
        return result;
    }
    NwrGuiCatalog.filterDatalistEntries = filterDatalistEntries;
    function datalistOptions(entries, query, limit = NwrGuiCatalog.DATALIST_LIMIT) {
        return filterDatalistEntries(entries, query, limit).map((entry) => ({
            value: optionValue(entry),
            label: optionLabel(entry)
        }));
    }
    NwrGuiCatalog.datalistOptions = datalistOptions;
    function filterEntries(entries, query) {
        const needle = String(query || "").trim().toLowerCase();
        if (!needle) {
            const copy = entries.slice();
            return { entries: copy, total: copy.length, hasMore: false, exact: true };
        }
        const result = [];
        for (const entry of entries) {
            if (entryMatchesSearch(entry, needle))
                result.push(entry);
        }
        return { entries: result, total: result.length, hasMore: false, exact: true };
    }
    NwrGuiCatalog.filterEntries = filterEntries;
    function catalogEntryKey(entry, key) {
        return key ? key(entry) : entry.id;
    }
    NwrGuiCatalog.catalogEntryKey = catalogEntryKey;
    function catalogCountText(result, page, pageCount) {
        if (!result.total)
            return "0 条";
        return `共 ${result.total} 条 / ${page}/${pageCount} 页`;
    }
    NwrGuiCatalog.catalogCountText = catalogCountText;
    class CatalogPager {
        constructor(defaultPageSize = NwrGuiCatalog.CATALOG_PAGE_SIZE) {
            this.defaultPageSize = defaultPageSize;
            this.states = new Map();
        }
        stateFor(targetId, queryKey) {
            const current = this.states.get(targetId);
            if (current && current.queryKey === queryKey)
                return current;
            const next = { queryKey, page: 1, pageSize: this.defaultPageSize };
            this.states.set(targetId, next);
            return next;
        }
        clamp(state, total) {
            const pageCount = Math.max(1, Math.ceil(Math.max(0, Number(total || 0)) / state.pageSize));
            state.page = Math.min(Math.max(1, Math.floor(Number(state.page || 1))), pageCount);
            return pageCount;
        }
        start(state) {
            return (Math.max(1, Number(state.page || 1)) - 1) * state.pageSize;
        }
        change(targetId, queryKey, action, pageCount) {
            const state = this.stateFor(targetId, queryKey);
            const lastPage = Math.max(1, Number(pageCount || 1));
            let nextPage = Number(state.page || 1);
            if (action === "first")
                nextPage = 1;
            else if (action === "prev")
                nextPage -= 1;
            else if (action === "next")
                nextPage += 1;
            else if (action === "last")
                nextPage = lastPage;
            nextPage = Math.min(Math.max(1, Math.floor(nextPage)), lastPage);
            if (nextPage === state.page)
                return false;
            state.page = nextPage;
            return true;
        }
    }
    NwrGuiCatalog.CatalogPager = CatalogPager;
    function optionValue(entry) {
        if (typeof entry.value === "string" || typeof entry.value === "number")
            return entry.value;
        if (typeof entry.uid === "string" || typeof entry.uid === "number")
            return entry.uid;
        return entry.id;
    }
    function optionLabel(entry) {
        return typeof entry.label === "string" ? entry.label : entry.name;
    }
    function entryMatchesSearch(entry, needle) {
        if (!needle)
            return true;
        if (entry.searchText && entry.searchText.includes(needle))
            return true;
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
})(NwrGuiCatalog || (NwrGuiCatalog = {}));
var NwrGuiCatalogUi;
(function (NwrGuiCatalogUi) {
    NwrGuiCatalogUi.CATALOG_LIST_IDS = [
        "itemList",
        "skillList",
        "actorList",
        "variableList",
        "switchList",
        "mapList",
        "commonEventList"
    ];
    function createCatalogView(input) {
        const queryKey = `${input.options.kind || ""}:${input.options.query || ""}`;
        const pageState = input.pager.stateFor(input.targetId, queryKey);
        const filtered = NwrGuiCatalog.filterEntries(input.sourceEntries, input.options.query);
        let pageCount = input.pager.clamp(pageState, filtered.total);
        const selectedKey = input.options.selectedId == null ? "" : String(input.options.selectedId);
        const shouldLocateSelected = selectedKey !== ""
            && (!input.previousView || input.previousView.queryKey !== queryKey || input.previousView.selectedKey !== selectedKey);
        if (shouldLocateSelected && filtered.entries.length) {
            const selectedIndex = filtered.entries.findIndex((entry) => (String(NwrGuiCatalog.catalogEntryKey(entry, input.options.key)) === selectedKey));
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
    NwrGuiCatalogUi.createCatalogView = createCatalogView;
    function applyCatalogCountTarget(view) {
        const target = view.options.countTarget;
        if (target)
            target.textContent = NwrGuiCatalog.catalogCountText(view.filtered, view.page, view.pageCount);
    }
    NwrGuiCatalogUi.applyCatalogCountTarget = applyCatalogCountTarget;
    function renderVirtualCatalog(target, view, context) {
        if (!elementIsVisible(target))
            return false;
        if (target.classList.contains("catalog-list-collapsed"))
            return false;
        if (!view.entries.length) {
            target.innerHTML = '<div class="catalog-empty">没有匹配项</div>';
            view.renderKey = "empty";
            return true;
        }
        const renderKey = `static:${view.options.selectedId}:${view.page}:${view.entries.length}:${target.clientWidth}:${context.iconRenderVersion}`;
        if (view.renderKey === renderKey)
            return false;
        view.renderKey = renderKey;
        const rows = view.entries.map((entry, index) => catalogRowHtml(entry, view.options, index * view.rowHeight));
        target.innerHTML = `<div class="catalog-spacer" style="height:${view.entries.length * view.rowHeight}px">${rows.join("")}</div>`;
        return true;
    }
    NwrGuiCatalogUi.renderVirtualCatalog = renderVirtualCatalog;
    function changeCatalogPage(pager, view, action) {
        return pager.change(view.targetId, view.queryKey, action, Math.max(1, view.pageCount));
    }
    NwrGuiCatalogUi.changeCatalogPage = changeCatalogPage;
    function elementIsVisible(element) {
        return !!(element && element.offsetParent !== null && !element.closest("[hidden]"));
    }
    NwrGuiCatalogUi.elementIsVisible = elementIsVisible;
    function shouldForwardWheel(input) {
        if (!input.deltaY || input.scrollHeight <= input.clientHeight + 1)
            return false;
        const atTop = input.scrollTop <= 0;
        const atBottom = input.scrollTop + input.clientHeight >= input.scrollHeight - 1;
        return (input.deltaY < 0 && atTop) || (input.deltaY > 0 && atBottom);
    }
    NwrGuiCatalogUi.shouldForwardWheel = shouldForwardWheel;
    function catalogRowHtml(entry, options, top) {
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
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})(NwrGuiCatalogUi || (NwrGuiCatalogUi = {}));
var NwrGuiCatalogUi;
(function (NwrGuiCatalogUi) {
    function catalogToolsHtml() {
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
    NwrGuiCatalogUi.catalogToolsHtml = catalogToolsHtml;
    function catalogToolState(view, collapsed, expanded) {
        if (!view)
            return emptyCatalogToolState(collapsed, expanded);
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
    NwrGuiCatalogUi.catalogToolState = catalogToolState;
    function catalogToolElements(tools) {
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
    NwrGuiCatalogUi.catalogToolElements = catalogToolElements;
    function applyCatalogToolState(elements, state) {
        if (elements.collapseButton)
            elements.collapseButton.textContent = state.collapseText;
        if (elements.expandButton)
            elements.expandButton.textContent = state.expandText;
        if (elements.status)
            elements.status.textContent = state.pageStatusText;
        setDisabled(elements.firstButton, state.firstDisabled);
        setDisabled(elements.prevButton, state.prevDisabled);
        setDisabled(elements.nextButton, state.nextDisabled);
        setDisabled(elements.lastButton, state.lastDisabled);
    }
    NwrGuiCatalogUi.applyCatalogToolState = applyCatalogToolState;
    function emptyCatalogToolState(collapsed, expanded) {
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
    function toolNode(tools, name) {
        return tools ? tools.querySelector(`[data-catalog-tool="${name}"]`) : null;
    }
    function setDisabled(button, disabled) {
        if (button)
            button.disabled = disabled;
    }
})(NwrGuiCatalogUi || (NwrGuiCatalogUi = {}));
var NwrGuiCatalog;
(function (NwrGuiCatalog) {
    function loadCatalogs(fs, path, dataDir) {
        const systemData = NwrGuiCatalog.record(NwrGuiCatalog.readJson(fs, path.join(dataDir, "System.json")));
        const catalogs = {
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
    NwrGuiCatalog.loadCatalogs = loadCatalogs;
    function readJsonArray(fs, filePath) {
        const data = NwrGuiCatalog.readJson(fs, filePath);
        return Array.isArray(data) ? data : [];
    }
    NwrGuiCatalog.readJsonArray = readJsonArray;
    function readJson(fs, filePath) {
        try {
            if (!fs.existsSync(filePath))
                return null;
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        }
        catch {
            return null;
        }
    }
    NwrGuiCatalog.readJson = readJson;
    function finiteNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }
    NwrGuiCatalog.finiteNumber = finiteNumber;
    function arrayField(row, key) {
        const value = row ? row[key] : null;
        return Array.isArray(value) ? value : [];
    }
    NwrGuiCatalog.arrayField = arrayField;
    function property(row, key) {
        return row ? row[key] : undefined;
    }
    NwrGuiCatalog.property = property;
    function record(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
    NwrGuiCatalog.record = record;
    function isRecord(value) {
        return !!value;
    }
    NwrGuiCatalog.isRecord = isRecord;
    function isIdRecord(value) {
        const row = NwrGuiCatalog.record(value);
        return !!row && Number.isFinite(Number(row.id));
    }
    NwrGuiCatalog.isIdRecord = isIdRecord;
    function isNamedIdRecord(value) {
        const row = NwrGuiCatalog.record(value);
        return !!row && Number.isFinite(Number(row.id)) && !!row.name;
    }
    NwrGuiCatalog.isNamedIdRecord = isNamedIdRecord;
    function unique(values) {
        return Array.from(new Set(values.filter(Boolean)));
    }
    NwrGuiCatalog.unique = unique;
    function uniqueNumbers(values) {
        return Array.from(new Set(values.filter(Number.isFinite))).sort((a, b) => a - b);
    }
    NwrGuiCatalog.uniqueNumbers = uniqueNumbers;
    function loadCatalog(fs, path, dataDir, fileName) {
        const data = NwrGuiCatalog.readJson(fs, path.join(dataDir, fileName));
        if (!Array.isArray(data))
            return [];
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
    function buildAllItemCatalog(catalogs) {
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
    function loadNamedArrayCatalog(names) {
        return names.flatMap((name, index) => {
            const text = NwrGuiCatalog.cleanText(name || "");
            if (!text)
                return [];
            return [{
                    id: index,
                    name: text,
                    description: "",
                    noteText: "",
                    searchText: NwrGuiCatalog.makeSearchText([index, text, name])
                }];
        });
    }
    function loadMapCatalog(fs, path, dataDir) {
        const data = NwrGuiCatalog.readJson(fs, path.join(dataDir, "MapInfos.json"));
        if (!Array.isArray(data))
            return [];
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
    function loadCommonEventCatalog(fs, path, dataDir) {
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
})(NwrGuiCatalog || (NwrGuiCatalog = {}));
(function () {
    const fs = require("fs");
    const path = require("path");
    const childProcess = require("child_process");
    const projectRoot = path.resolve(process.cwd(), "..", "..");
    const rootDir = resolveGameRoot(projectRoot);
    const launchRuntimeScript = path.join(projectRoot, "tools", "launch-runtime.ps1");
    const preparedGameDir = path.join(projectRoot, "runtime", "game-app");
    const preparedGameLauncherPath = path.join(preparedGameDir, "start-manual-bg-bridge.cmd");
    const bridgePaths = NwrGuiBridgeIO.createBridgePaths(path, projectRoot);
    const saveDir = path.join(rootDir, "www", "save");
    const dataDir = path.join(projectRoot, "output", "extract", "data");
    const iconDir = path.join(process.cwd(), "icons");
    const exportedIconSetPath = path.join(iconDir, "IconSet.png");
    const fallbackIconSetPath = path.join(rootDir, "www", "img", "system", "IconSet.png");
    const EXPECTED_BRIDGE_VERSION = "0.2.32";
    const ICON_EXPORT_RETRY_MS = 5000;
    const $ = (id) => {
        const element = document.getElementById(id);
        if (!element)
            throw new Error(`Missing GUI element: ${id}`);
        return element;
    };
    const dom = {
        statusPill: $("statusPill"),
        launchBtn: $("launchBtn"),
        openPreparedGameBtn: $("openPreparedGameBtn"),
        runtimeRoute: $("runtimeRoute"),
        runtimeRouteRisk: $("runtimeRouteRisk"),
        runtimeRouteStatus: $("runtimeRouteStatus"),
        refreshBtn: $("refreshBtn"),
        bridgeState: $("bridgeState"),
        preparedGameState: $("preparedGameState"),
        partyState: $("partyState"),
        goldState: $("goldState"),
        goldMetric: $("goldMetric"),
        saveState: $("saveState"),
        mapState: $("mapState"),
        saveFiles: $("saveFiles"),
        partyMembers: $("partyMembers"),
        prisonGuardSummary: $("prisonGuardSummary"),
        prisonGuardMetrics: $("prisonGuardMetrics"),
        prisonGuardList: $("prisonGuardList"),
        prisonRepairBtn: $("prisonRepairBtn"),
        variableList: $("variableList"),
        variableListCount: $("variableListCount"),
        switchList: $("switchList"),
        switchListCount: $("switchListCount"),
        itemList: $("itemList"),
        itemListCount: $("itemListCount"),
        skillList: $("skillList"),
        skillListCount: $("skillListCount"),
        actorList: $("actorList"),
        actorListCount: $("actorListCount"),
        mapList: $("mapList"),
        mapListCount: $("mapListCount"),
        commonEventList: $("commonEventList"),
        commonEventListCount: $("commonEventListCount"),
        eventList: $("eventList"),
        battleState: $("battleState"),
        toolSectionNav: $("toolSectionNav"),
        diagnosticState: $("diagnosticState"),
        openDiagnosticsBtn: $("openDiagnosticsBtn"),
        toast: $("toast")
    };
    let lastEventSize = 0;
    let switchValue = true;
    let gameProcess = null;
    let iconSetImage = null;
    let iconRenderVersion = 0;
    let latestState = null;
    let recordedPosition = null;
    let toastTimer;
    let iconExportRequested = false;
    let iconExportCompleted = false;
    let iconExportLastAttemptMs = 0;
    let selectedRuntimeRoute = NwrGuiRuntimeRoutes.defaultRouteName();
    let activeToolTab = "core";
    const activeToolSections = {
        core: "gold",
        catalog: "item",
        world: "map",
        misc: "variable",
        debug: "diagnostics"
    };
    const iconCache = new Map();
    const catalogViews = new Map();
    const catalogPager = new NwrGuiCatalog.CatalogPager();
    const datalistSources = new Map();
    const CATALOG_LIST_IDS = NwrGuiCatalogUi.CATALOG_LIST_IDS;
    const itemKindLabels = NwrGuiCatalog.ITEM_KIND_LABELS;
    let selectedItemKind = "item";
    let catalogs = emptyCatalogs();
    process.env.DQ2_MODKIT_ROOT = projectRoot;
    process.env.DQ2_GAME_ROOT = rootDir;
    function emptyCatalogs() {
        return {
            variable: [],
            switch: [],
            item: [],
            weapon: [],
            armor: [],
            actor: [],
            skill: [],
            map: [],
            commonEvent: [],
            all: []
        };
    }
    function resolveGameRoot(projectRoot) {
        const candidates = [];
        if (process.env.DQ2_GAME_ROOT)
            candidates.push(process.env.DQ2_GAME_ROOT);
        try {
            const configPath = path.join(projectRoot, "config.local.json");
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
                if (config && config.gameRoot)
                    candidates.push(String(config.gameRoot));
            }
        }
        catch (error) {
            throw new Error("Invalid config.local.json: " + (error && error.message || error));
        }
        candidates.push(path.resolve(projectRoot, ".."));
        for (const candidate of candidates) {
            const fullPath = path.resolve(projectRoot, expandEnv(candidate));
            if (fs.existsSync(path.join(fullPath, "www", "index.html"))) {
                return fs.realpathSync(fullPath);
            }
        }
        throw new Error("Game root not found. Set DQ2_GAME_ROOT or create config.local.json.");
    }
    function expandEnv(value) {
        return String(value).replace(/%([^%]+)%|\$\{([^}]+)\}/g, (match, winName, posixName) => {
            const name = winName || posixName;
            return process.env[name] || match;
        });
    }
    function readJson(file) {
        try {
            if (!fs.existsSync(file))
                return null;
            return JSON.parse(fs.readFileSync(file, "utf8"));
        }
        catch {
            return null;
        }
    }
    function datalistOptionHtml(option) {
        return `<option value="${escapeHtml(option.value)}" label="${escapeHtml(option.label)}"></option>`;
    }
    function populateDatalist(id, entries) {
        const list = $(id);
        if (!list)
            return;
        datalistSources.set(id, entries || []);
        list.innerHTML = NwrGuiCatalog.datalistOptions(entries || [], "", NwrGuiCatalog.DATALIST_LIMIT)
            .map(datalistOptionHtml)
            .join("");
    }
    function refreshPickerDatalist(input) {
        const listId = input.getAttribute("list");
        if (!listId)
            return;
        const entries = datalistSources.get(listId);
        if (!entries)
            return;
        const list = $(listId);
        if (!list)
            return;
        list.innerHTML = NwrGuiCatalog.datalistOptions(entries, input.value, NwrGuiCatalog.DATALIST_LIMIT)
            .map(datalistOptionHtml)
            .join("");
    }
    function existingIconSetPath() {
        if (validIconSheet(exportedIconSetPath))
            return exportedIconSetPath;
        if (validIconSheet(fallbackIconSetPath))
            return fallbackIconSetPath;
        return "";
    }
    function exportedIconSetReady() {
        return validIconSheet(exportedIconSetPath);
    }
    function validIconSheet(filePath) {
        try {
            if (!fs.existsSync(filePath))
                return false;
            const bytes = fs.readFileSync(filePath);
            if (!hasPngHeader(bytes) || bytes.length < 24)
                return false;
            return bytes.readUInt32BE(16) >= 32 && bytes.readUInt32BE(20) >= 32;
        }
        catch {
            return false;
        }
    }
    function hasPngHeader(bytes) {
        return bytes.length >= 8
            && bytes[0] === 0x89
            && bytes[1] === 0x50
            && bytes[2] === 0x4e
            && bytes[3] === 0x47
            && bytes[4] === 0x0d
            && bytes[5] === 0x0a
            && bytes[6] === 0x1a
            && bytes[7] === 0x0a;
    }
    function iconSetBytes(filePath) {
        const bytes = fs.readFileSync(filePath);
        return hasPngHeader(bytes) ? bytes : decryptProtectedImage(bytes);
    }
    function setupIconSet() {
        const iconSetPath = existingIconSetPath();
        if (!iconSetPath)
            return;
        try {
            const bytes = iconSetBytes(iconSetPath);
            const image = new Image();
            image.onload = () => {
                iconSetImage = image;
                iconRenderVersion += 1;
                renderCatalogs();
            };
            image.onerror = () => showToast("图标集图片解码失败");
            image.src = `data:image/png;base64,${bytes.toString("base64")}`;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(`图标集加载失败：${message}`);
        }
    }
    function decryptProtectedImage(input) {
        const data = Buffer.from(input);
        if (data.length <= 100)
            return data;
        const head = data.subarray(0, 100);
        const body = unshuffleBytes(data.subarray(100));
        for (let i = 0; i < body.length; i += 1) {
            body[i] ^= (i % 256) ^ 90;
        }
        return Buffer.concat([head, body]);
    }
    function unshuffleBytes(input) {
        const bytes = Array.from(input);
        const swaps = [];
        let remaining = bytes.length;
        const random = (max) => {
            const value = 10000 * Math.sin(12345 + remaining);
            return Math.floor((value - Math.floor(value)) * max);
        };
        while (remaining !== 0) {
            swaps.push(random(remaining));
            remaining -= 1;
        }
        const positions = Array.from({ length: bytes.length }, (_, index) => index);
        for (let i = 0; i < swaps.length; i += 1) {
            const from = swaps[i];
            const to = positions.length - 1 - i;
            if (from < to) {
                const old = positions[from];
                positions[from] = positions[to];
                positions[to] = old;
            }
        }
        const output = new Array(bytes.length);
        for (let i = 0; i < bytes.length; i += 1)
            output[positions[i]] = bytes[i];
        return Buffer.from(output);
    }
    function iconDataUrl(iconIndex) {
        const index = Math.max(0, Math.floor(Number(iconIndex) || 0));
        const cached = iconCache.get(index);
        if (cached)
            return cached;
        if (!iconSetImage)
            return "";
        const x = (index % 16) * 32;
        const y = Math.floor(index / 16) * 32;
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext("2d");
        if (!context)
            return "";
        context.imageSmoothingEnabled = false;
        context.drawImage(iconSetImage, x, y, 32, 32, 0, 0, 32, 32);
        const dataUrl = canvas.toDataURL("image/png");
        iconCache.set(index, dataUrl);
        return dataUrl;
    }
    function iconHtml(iconIndex) {
        const index = Math.max(0, Math.floor(Number(iconIndex) || 0));
        const fileName = `icon_${index}.png`;
        if (fs.existsSync(path.join(iconDir, fileName))) {
            return `<img class="rpg-icon" src="icons/${fileName}" alt="icon ${index}">`;
        }
        const dataUrl = iconDataUrl(iconIndex);
        if (!dataUrl)
            return '<span class="rpg-icon icon-pending"></span>';
        return `<img class="rpg-icon" src="${dataUrl}" alt="icon ${index}">`;
    }
    function actorAvatarHtml(actor) {
        return `<span class="actor-avatar">${escapeHtml(actor.id)}</span>`;
    }
    function badgeHtml(label, tone = "") {
        return `<span class="catalog-badge ${tone}">${escapeHtml(label)}</span>`;
    }
    function selectedNumber(id) {
        return Number(numberValue(id, NaN));
    }
    function parseItemSelection() {
        const raw = String($("itemId").value || "").trim();
        const match = raw.match(/^(item|weapon|armor)\s*:\s*(\d+)$/i);
        if (match) {
            return { kind: match[1].toLowerCase(), id: Number(match[2]), raw: `${match[1].toLowerCase()}:${match[2]}` };
        }
        const chooserKind = $("itemKind").value;
        const kind = chooserKind === "all" ? selectedItemKind : chooserKind;
        return { kind, id: numberValue("itemId", NaN), raw };
    }
    function itemSelectionKey(selection) {
        return `${selection.kind}:${selection.id}`;
    }
    function debounce(fn, delay = 120) {
        let timer;
        return function () {
            const args = arguments;
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
    function renderVirtualCatalog(target) {
        const view = catalogViews.get(target.id);
        if (!view)
            return;
        NwrGuiCatalogUi.renderVirtualCatalog(target, view, { iconRenderVersion });
    }
    function renderCatalogList(target, entries, options) {
        const previous = catalogViews.get(target.id);
        const view = NwrGuiCatalogUi.createCatalogView({
            targetId: target.id,
            previousView: previous,
            sourceEntries: entries,
            options,
            pager: catalogPager
        });
        catalogViews.set(target.id, view);
        if (!previous || previous.queryKey !== view.queryKey)
            target.scrollTop = 0;
        NwrGuiCatalogUi.applyCatalogCountTarget(view);
        updateCatalogLimitTools(target);
        if (!NwrGuiCatalogUi.elementIsVisible(target))
            return;
        renderVirtualCatalog(target);
    }
    function renderItemList() {
        const kind = $("itemKind").value;
        const entries = catalogs[kind] || [];
        const selection = parseItemSelection();
        renderCatalogList(dom.itemList, entries, {
            kind,
            query: $("itemSearch").value,
            selectedId: kind === "all" ? itemSelectionKey(selection) : selection.id,
            key: (entry) => entry.uid || entry.id,
            rowKind: (entry) => entry.kind || kind,
            leading: (entry) => iconHtml(entry.iconIndex),
            extra: (entry) => entry.kindLabel || "",
            actions: (entry) => `<button data-catalog-action="item-add" data-kind="${entry.kind || kind}" data-id="${entry.id}">添加</button>`,
            description: (entry) => entry.description || entry.noteText,
            countTarget: dom.itemListCount
        });
    }
    function renderSkillList() {
        const entries = catalogs.skill || [];
        renderCatalogList(dom.skillList, entries, {
            kind: "skill",
            query: $("skillSearch").value,
            selectedId: selectedNumber("skillId"),
            leading: (entry) => iconHtml(entry.iconIndex),
            actions: (entry) => `<button data-catalog-action="skill-learn" data-id="${entry.id}">学会</button><button data-catalog-action="skill-forget" data-id="${entry.id}">遗忘</button>`,
            description: (entry) => entry.description || entry.noteText,
            countTarget: dom.skillListCount
        });
    }
    function renderActorList() {
        const entries = catalogs.actor || [];
        renderCatalogList(dom.actorList, entries, {
            kind: "actor",
            query: $("actorSearch").value,
            selectedId: selectedNumber("actorId"),
            leading: actorAvatarHtml,
            extra: (entry) => entry.faceName || entry.characterName || "",
            actions: (entry) => `<button data-catalog-action="actor-unlock" data-id="${entry.id}">解锁</button><button data-catalog-action="actor-select" data-id="${entry.id}">编辑</button>`,
            countTarget: dom.actorListCount
        });
    }
    function renderVariableList() {
        const entries = catalogs.variable || [];
        renderCatalogList(dom.variableList, entries, {
            kind: "variable",
            query: $("variableSearch").value,
            selectedId: selectedNumber("variableId"),
            leading: (entry) => badgeHtml(entry.id, "var"),
            actions: (entry) => `<button data-catalog-action="variable-select" data-id="${entry.id}">填入</button><button data-catalog-action="variable-set" data-id="${entry.id}">写入</button>`,
            countTarget: dom.variableListCount
        });
    }
    function renderSwitchList() {
        const entries = catalogs.switch || [];
        renderCatalogList(dom.switchList, entries, {
            kind: "switch",
            query: $("switchSearch").value,
            selectedId: selectedNumber("switchId"),
            leading: (entry) => badgeHtml(entry.id, "switch"),
            actions: (entry) => `<button data-catalog-action="switch-on" data-id="${entry.id}">ON</button><button data-catalog-action="switch-off" data-id="${entry.id}">OFF</button>`,
            countTarget: dom.switchListCount
        });
    }
    function renderMapList() {
        const entries = catalogs.map || [];
        renderCatalogList(dom.mapList, entries, {
            kind: "map",
            query: $("mapSearch").value,
            selectedId: selectedNumber("mapId"),
            leading: (entry) => badgeHtml(entry.id, "map"),
            actions: (entry) => `<button data-catalog-action="map-transfer" data-id="${entry.id}">传送</button>`,
            description: (entry) => entry.description,
            countTarget: dom.mapListCount
        });
    }
    function renderCommonEventList() {
        const entries = catalogs.commonEvent || [];
        renderCatalogList(dom.commonEventList, entries, {
            kind: "commonEvent",
            query: $("commonEventSearch").value,
            selectedId: selectedNumber("commonEventId"),
            leading: (entry) => badgeHtml(entry.id, "event"),
            actions: (entry) => `<button data-catalog-action="common-event-run" data-id="${entry.id}">运行</button>`,
            description: (entry) => entry.description,
            countTarget: dom.commonEventListCount
        });
    }
    const catalogRenderers = {
        itemList: renderItemList,
        skillList: renderSkillList,
        actorList: renderActorList,
        variableList: renderVariableList,
        switchList: renderSwitchList,
        mapList: renderMapList,
        commonEventList: renderCommonEventList
    };
    function renderActiveCatalogs() {
        CATALOG_LIST_IDS.forEach((id) => {
            const element = $(id);
            if (NwrGuiCatalogUi.elementIsVisible(element) && catalogRenderers[id])
                catalogRenderers[id]();
        });
    }
    function renderCatalogs() {
        renderActiveCatalogs();
    }
    function showToast(message) {
        dom.toast.textContent = message;
        dom.toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2600);
    }
    function applyRuntimeStatus(status) {
        dom.statusPill.className = status.className;
        dom.statusPill.textContent = status.text;
    }
    function saveFilesHtml(files, hasState) {
        if (!hasState)
            return "";
        return files.length
            ? files.map((name) => `<li>${escapeHtml(name)}</li>`).join("")
            : "<li>未检测到</li>";
    }
    function partyMembersHtml(members, hasState) {
        if (!hasState)
            return "";
        return members.length
            ? members.map((actor) => `<li><strong>${escapeHtml(actor.id)} / ${escapeHtml(actor.name)}</strong><span>${escapeHtml(actor.vitals)}</span></li>`).join("")
            : "<li>未检测到</li>";
    }
    function routeOptionHtml(route) {
        const selected = route.name === selectedRuntimeRoute ? " selected" : "";
        return `<option value="${escapeHtml(route.name)}"${selected}>${escapeHtml(route.label)}</option>`;
    }
    function renderRuntimeRoute() {
        const model = NwrGuiRuntimeRoutes.diagnosticModel(selectedRuntimeRoute);
        if (dom.runtimeRoute)
            dom.runtimeRoute.value = model.routeName;
        if (dom.runtimeRouteRisk)
            dom.runtimeRouteRisk.textContent = model.riskNote;
        if (dom.runtimeRouteStatus) {
            dom.runtimeRouteStatus.textContent = model.switchText === "(none)" ? "default" : model.switchText;
            dom.runtimeRouteStatus.title = `${model.routeName} / switches: ${model.switchText}`;
        }
    }
    function setupRuntimeRoutes() {
        if (!dom.runtimeRoute)
            return;
        dom.runtimeRoute.innerHTML = NwrGuiRuntimeRoutes.routeOptions().map(routeOptionHtml).join("");
        renderRuntimeRoute();
        dom.runtimeRoute.addEventListener("change", () => {
            selectedRuntimeRoute = NwrGuiRuntimeRoutes.normalizeRouteName(dom.runtimeRoute.value);
            renderRuntimeRoute();
        });
    }
    function formatNumber(value) {
        if (value == null || value === "")
            return "-";
        const number = Number(value);
        if (!Number.isFinite(number))
            return String(value);
        return new Intl.NumberFormat("zh-CN").format(number);
    }
    function parseValue(text) {
        const value = String(text).trim();
        if (value === "true")
            return true;
        if (value === "false")
            return false;
        if (value === "null")
            return null;
        if (value !== "" && Number.isFinite(Number(value)))
            return Number(value);
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    function numberValue(id, fallback = 0) {
        const value = looseNumber($(id).value);
        return Number.isFinite(value) ? value : fallback;
    }
    function optionalNumber(id) {
        const text = String($(id).value).trim();
        if (text === "")
            return undefined;
        const value = looseNumber(text);
        return Number.isFinite(value) ? value : undefined;
    }
    function looseNumber(value) {
        const text = String(value == null ? "" : value).trim();
        if (text === "")
            return NaN;
        const direct = Number(text);
        if (Number.isFinite(direct))
            return direct;
        const match = text.match(/-?\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : NaN;
    }
    function activeActorId() {
        return numberValue("actorId", 0);
    }
    function skillActorId() {
        return numberValue("skillActorId", activeActorId());
    }
    function actorPointClassId() {
        return optionalNumber("actorPointClassId");
    }
    function updateLookupHints() {
        const itemSelection = parseItemSelection();
        const itemName = NwrGuiCatalog.catalogName(catalogs, itemSelection.kind, itemSelection.id);
        const itemKindLabel = itemKindLabels[itemSelection.kind] || itemSelection.kind;
        $("itemHint").textContent = itemName ? `${itemKindLabel} ${itemSelection.id} / ${itemName}` : "";
        const actorId = numberValue("actorId", NaN);
        const actorName = NwrGuiCatalog.catalogName(catalogs, "actor", actorId);
        $("actorHint").textContent = actorName ? `${actorId} / ${actorName}` : "";
        const skillActorName = NwrGuiCatalog.catalogName(catalogs, "actor", numberValue("skillActorId", NaN));
        const skillName = NwrGuiCatalog.catalogName(catalogs, "skill", numberValue("skillId", NaN));
        $("skillHint").textContent = [skillActorName, skillName].filter(Boolean).join(" / ");
        const variableName = NwrGuiCatalog.catalogName(catalogs, "variable", numberValue("variableId", NaN));
        $("variableHint").textContent = variableName ? `${$("variableId").value} / ${variableName}` : "";
        const switchName = NwrGuiCatalog.catalogName(catalogs, "switch", numberValue("switchId", NaN));
        $("switchHint").textContent = switchName ? `${$("switchId").value} / ${switchName}` : "";
        const mapName = NwrGuiCatalog.catalogName(catalogs, "map", numberValue("mapId", NaN));
        $("mapHint").textContent = mapName ? `${$("mapId").value} / ${mapName}` : "";
        const commonEventName = NwrGuiCatalog.catalogName(catalogs, "commonEvent", numberValue("commonEventId", NaN));
        $("commonEventHint").textContent = commonEventName ? `${$("commonEventId").value} / ${commonEventName}` : "";
    }
    function refreshCatalogControls() {
        populateDatalist("allOptions", catalogs.all);
        populateDatalist("itemOptions", catalogs.item);
        populateDatalist("weaponOptions", catalogs.weapon);
        populateDatalist("armorOptions", catalogs.armor);
        populateDatalist("actorOptions", catalogs.actor);
        populateDatalist("skillOptions", catalogs.skill);
        populateDatalist("variableOptions", catalogs.variable);
        populateDatalist("switchOptions", catalogs.switch);
        populateDatalist("mapOptions", catalogs.map);
        populateDatalist("commonEventOptions", catalogs.commonEvent);
        updateLookupHints();
        renderCatalogs();
    }
    function setupCatalogs() {
        refreshCatalogControls();
        $("itemKind").addEventListener("change", () => {
            const kind = $("itemKind").value;
            $("itemId").setAttribute("list", `${kind}Options`);
            if (kind === "all") {
                const selection = parseItemSelection();
                if (Number.isFinite(selection.id))
                    $("itemId").value = itemSelectionKey(selection);
            }
            else if (/^(item|weapon|armor)\s*:/i.test($("itemId").value)) {
                $("itemId").value = String(parseItemSelection().id || "");
            }
            refreshPickerDatalist($("itemId"));
            updateLookupHints();
            renderItemList();
        });
        $("itemSearch").addEventListener("input", debounce(renderItemList));
        $("skillSearch").addEventListener("input", debounce(renderSkillList));
        $("actorSearch").addEventListener("input", debounce(renderActorList));
        $("variableSearch").addEventListener("input", debounce(renderVariableList));
        $("switchSearch").addEventListener("input", debounce(renderSwitchList));
        $("mapSearch").addEventListener("input", debounce(renderMapList));
        $("commonEventSearch").addEventListener("input", debounce(renderCommonEventList));
        $("itemId").addEventListener("input", () => {
            updateLookupHints();
            renderItemList();
        });
        $("actorId").addEventListener("input", () => {
            updateLookupHints();
            renderActorList();
        });
        $("skillId").addEventListener("input", () => {
            updateLookupHints();
            renderSkillList();
        });
        ["skillActorId"].forEach((id) => {
            $(id).addEventListener("input", updateLookupHints);
        });
        ["variableId", "switchId", "mapId", "commonEventId"].forEach((id) => {
            $(id).addEventListener("input", () => {
                updateLookupHints();
                if (id === "variableId")
                    renderVariableList();
                else if (id === "switchId")
                    renderSwitchList();
                else if (id === "mapId")
                    renderMapList();
                else if (id === "commonEventId")
                    renderCommonEventList();
            });
        });
        setupPickerInputs();
    }
    function loadCatalogAssetsAfterFirstPaint() {
        requestAnimationFrame(() => {
            setTimeout(() => {
                catalogs = NwrGuiCatalog.loadCatalogs(fs, path, dataDir);
                refreshCatalogControls();
                setupIconSet();
            }, 0);
        });
    }
    function setupPickerInputs() {
        document.querySelectorAll("input[list]").forEach((input) => {
            input.setAttribute("autocomplete", "off");
            input.dataset.pickerLastValue = input.value || "";
            input.addEventListener("focus", () => {
                const value = String(input.value || "");
                refreshPickerDatalist(input);
                if (!value.trim())
                    return;
                input.dataset.pickerLastValue = value;
                input.dataset.pickerCleared = "true";
                input.value = "";
                refreshPickerDatalist(input);
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dataset.pickerLastValue = value;
                input.dataset.pickerCleared = "true";
            });
            input.addEventListener("input", () => {
                refreshPickerDatalist(input);
                input.dataset.pickerCleared = "false";
                input.dataset.pickerLastValue = input.value || "";
            });
            input.addEventListener("keydown", (event) => {
                if (event.key !== "Escape" || input.dataset.pickerCleared !== "true")
                    return;
                input.value = input.dataset.pickerLastValue || input.defaultValue || "";
                input.dataset.pickerCleared = "false";
                refreshPickerDatalist(input);
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.blur();
            });
            input.addEventListener("blur", () => {
                if (input.dataset.pickerCleared === "true" && !String(input.value || "").trim()) {
                    input.value = input.dataset.pickerLastValue || input.defaultValue || "";
                    refreshPickerDatalist(input);
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                }
                input.dataset.pickerCleared = "false";
                input.dataset.pickerLastValue = input.value || "";
            });
        });
    }
    function bindVirtualScroll(target) {
        target.tabIndex = 0;
        target.addEventListener("wheel", (event) => {
            const delta = Number(event.deltaY || 0);
            if (!NwrGuiCatalogUi.shouldForwardWheel({
                deltaY: delta,
                scrollTop: target.scrollTop,
                scrollHeight: target.scrollHeight,
                clientHeight: target.clientHeight
            }))
                return;
            const scroller = document.scrollingElement;
            if (!scroller || scroller === target)
                return;
            scroller.scrollBy({ top: delta, behavior: "auto" });
            event.preventDefault();
        }, { passive: false });
    }
    function toolPanelSnapshot(panel) {
        const title = panel.querySelector(".panel-title");
        return {
            tab: panel.dataset.toolPanel || "",
            sectionText: panel.dataset.toolSection || "",
            label: panel.dataset.toolLabel || title?.textContent?.trim() || "",
            navEnabled: panel.dataset.toolSectionNav !== "false",
            modePanel: panel.dataset.modePanel || ""
        };
    }
    function applyToolPanelAuditPolicy(panel, snapshot) {
        const policy = NwrGuiFeatureAudit.policyForPanel(snapshot);
        const controls = Array.from(panel.querySelectorAll("button, input, select, textarea"));
        NwrGuiFeatureAudit.applyPanelAuditState(panel, controls, policy);
        renderAuditGuardNote(panel, policy);
    }
    function renderAuditGuardNote(panel, policy) {
        const existing = panel.querySelector(".audit-guard-note");
        if (!policy || policy.actionAllowed) {
            if (existing)
                existing.remove();
            return;
        }
        const note = existing || document.createElement("div");
        note.className = "audit-guard-note";
        note.textContent = NwrGuiCommandGuardrails.panelGuardText(policy);
        if (!existing) {
            const title = panel.querySelector(".panel-title");
            if (title && title.nextSibling)
                panel.insertBefore(note, title.nextSibling);
            else if (title)
                panel.appendChild(note);
            else
                panel.prepend(note);
        }
    }
    function toolPanelSnapshots() {
        const snapshots = [];
        document.querySelectorAll("[data-tool-panel]").forEach((panel) => {
            const snapshot = toolPanelSnapshot(panel);
            applyToolPanelAuditPolicy(panel, snapshot);
            if (NwrGuiFeatureAudit.panelIsVisible(snapshot))
                snapshots.push(snapshot);
        });
        return snapshots;
    }
    function sectionsForTab(tab) {
        return NwrGuiToolNavigation.sectionsForTab(toolPanelSnapshots(), tab);
    }
    function ensureActiveToolSection(tab) {
        const sections = sectionsForTab(tab);
        return NwrGuiToolNavigation.ensureActiveSection(tab, sections, activeToolSections);
    }
    function updateToolSectionNav(tab) {
        const sections = sectionsForTab(tab);
        const active = ensureActiveToolSection(tab);
        dom.toolSectionNav.hidden = sections.length <= 1;
        dom.toolSectionNav.innerHTML = NwrGuiToolNavigation.navigationHtml(sections, active);
    }
    function panelMatchesActiveSection(panel) {
        const snapshot = toolPanelSnapshot(panel);
        applyToolPanelAuditPolicy(panel, snapshot);
        if (!NwrGuiFeatureAudit.panelIsVisible(snapshot))
            return false;
        const section = ensureActiveToolSection(activeToolTab);
        return NwrGuiToolNavigation.panelMatchesActiveSection(snapshot, activeToolTab, section, "");
    }
    function updateVisiblePanels() {
        ensureActiveToolSection(activeToolTab);
        document.querySelectorAll("[data-tool-panel]").forEach((panel) => {
            panel.hidden = !panelMatchesActiveSection(panel);
        });
        updateToolSectionNav(activeToolTab);
    }
    function activateToolSection(section, options = {}) {
        const sections = sectionsForTab(activeToolTab);
        if (!sections.some((item) => item.section === section))
            return;
        activeToolSections[activeToolTab] = section;
        updateVisiblePanels();
        if (!options.keepScroll)
            scrollActiveToolAreaToTop();
        requestAnimationFrame(renderActiveCatalogs);
    }
    function activateAdjacentToolSection(direction = 1) {
        const sections = sectionsForTab(activeToolTab);
        if (!sections.length)
            return;
        const active = ensureActiveToolSection(activeToolTab);
        const next = NwrGuiToolNavigation.nextSection(sections, active, direction);
        if (next)
            activateToolSection(next, { keepScroll: true });
    }
    function updateCatalogToolState(target) {
        const tools = target.__catalogTools;
        if (!tools)
            return;
        const collapsed = target.classList.contains("catalog-list-collapsed");
        const expanded = target.classList.contains("catalog-list-expanded");
        const view = catalogViews.get(target.id);
        const state = NwrGuiCatalogUi.catalogToolState(view, collapsed, expanded);
        NwrGuiCatalogUi.applyCatalogToolState(NwrGuiCatalogUi.catalogToolElements(tools), state);
    }
    function updateCatalogToolLabels(target) {
        updateCatalogToolState(target);
    }
    function updateCatalogLimitTools(target) {
        updateCatalogToolState(target);
    }
    function changeCatalogPage(target, action) {
        const view = catalogViews.get(target.id);
        if (!view)
            return;
        if (!NwrGuiCatalogUi.changeCatalogPage(catalogPager, view, action))
            return;
        target.scrollTop = 0;
        if (catalogRenderers[target.id])
            catalogRenderers[target.id]();
    }
    function revealCatalog(target) {
        if (!target.classList.contains("catalog-list-collapsed"))
            return;
        target.classList.remove("catalog-list-collapsed");
        updateCatalogToolLabels(target);
        requestAnimationFrame(() => renderVirtualCatalog(target));
    }
    function toggleCatalogCollapsed(target) {
        const collapsed = target.classList.toggle("catalog-list-collapsed");
        if (collapsed)
            target.classList.remove("catalog-list-expanded");
        updateCatalogToolLabels(target);
        if (!collapsed)
            requestAnimationFrame(() => renderVirtualCatalog(target));
    }
    function toggleCatalogExpanded(target) {
        target.classList.remove("catalog-list-collapsed");
        target.classList.toggle("catalog-list-expanded");
        updateCatalogToolLabels(target);
        requestAnimationFrame(() => renderVirtualCatalog(target));
    }
    function setupCatalogTools() {
        CATALOG_LIST_IDS.forEach((id) => {
            const target = $(id);
            if (!target || target.__catalogTools)
                return;
            const tools = document.createElement("div");
            tools.className = "catalog-tools";
            tools.innerHTML = NwrGuiCatalogUi.catalogToolsHtml();
            target.parentNode.insertBefore(tools, target);
            target.__catalogTools = tools;
            tools.addEventListener("click", (event) => {
                const button = event.target.closest("[data-catalog-tool]");
                if (!button)
                    return;
                const action = button.dataset.catalogTool;
                if (action === "collapse")
                    toggleCatalogCollapsed(target);
                else if (action === "expand")
                    toggleCatalogExpanded(target);
                else if (action === "first" || action === "prev" || action === "next" || action === "last")
                    changeCatalogPage(target, action);
                else if (action === "next-section")
                    activateAdjacentToolSection(1);
            });
            updateCatalogToolLabels(target);
        });
    }
    function updateViewportMode() {
        const pageScrollMode = NwrGuiToolNavigation.pageScrollMode(window.innerWidth, window.innerHeight);
        document.body.classList.toggle("page-scroll-mode", pageScrollMode);
        return pageScrollMode;
    }
    function rerenderAfterViewportChange() {
        updateViewportMode();
        renderCatalogs();
    }
    function bindViewportResize() {
        const handleResize = debounce(() => requestAnimationFrame(rerenderAfterViewportChange), 80);
        window.addEventListener("resize", handleResize);
        const visualViewport = window.visualViewport;
        if (visualViewport)
            visualViewport.addEventListener("resize", handleResize);
        updateViewportMode();
    }
    function scrollActiveToolAreaToTop() {
        const grid = document.querySelector(".tool-grid");
        if (grid)
            grid.scrollTop = 0;
        const scroller = document.scrollingElement;
        if (scroller)
            scroller.scrollTo({ top: 0, behavior: "auto" });
    }
    function resetRestoredPageScroll() {
        if ("scrollRestoration" in window.history) {
            window.history.scrollRestoration = "manual";
        }
        scrollActiveToolAreaToTop();
        window.setTimeout(scrollActiveToolAreaToTop, 0);
        window.setTimeout(scrollActiveToolAreaToTop, 250);
    }
    function sendCommand(command, _controlId = "", options = {}) {
        const payload = NwrGuiBridgeIO.sendCommand(fs, bridgePaths, command);
        if (!options.silent)
            showToast(`已发送：${payload.type}`);
        return payload;
    }
    function preparedGameReady() {
        return fs.existsSync(preparedGameLauncherPath);
    }
    function refreshPreparedGameControls() {
        const ready = preparedGameReady();
        dom.openPreparedGameBtn.disabled = !ready;
        dom.openPreparedGameBtn.title = ready
            ? preparedGameLauncherPath
            : "先点击“准备桥接”生成手动 bridge 游戏";
        dom.preparedGameState.textContent = ready ? "已准备" : "未准备";
        dom.preparedGameState.title = ready ? preparedGameLauncherPath : preparedGameDir;
    }
    function launchGame() {
        if (!fs.existsSync(launchRuntimeScript)) {
            showToast("找不到运行时启动脚本");
            return;
        }
        try {
            const route = NwrGuiRuntimeRoutes.diagnosticModel(selectedRuntimeRoute);
            const args = NwrGuiRuntimeRoutes.launchArguments([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                launchRuntimeScript,
                "-GameRoot",
                rootDir
            ], selectedRuntimeRoute);
            gameProcess = childProcess.spawn("powershell.exe", args, {
                cwd: projectRoot,
                env: {
                    ...process.env,
                    DQ2_MODKIT_ROOT: projectRoot,
                    DQ2_GAME_ROOT: rootDir
                },
                stdio: "ignore"
            });
            dom.launchBtn.disabled = true;
            showToast(`正在准备：${route.label}`);
            gameProcess.on("error", (error) => {
                dom.launchBtn.disabled = false;
                const message = error instanceof Error ? error.message : String(error);
                showToast(`准备失败：${message}`);
            });
            gameProcess.on("exit", (code, signal) => {
                dom.launchBtn.disabled = false;
                refreshPreparedGameControls();
                refresh();
                if (code === 0) {
                    showToast("桥接已准备，点击“打开游戏”");
                    return;
                }
                showToast(`准备失败：${signal || `exit ${code == null ? "unknown" : code}`}`);
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(`启动失败：${message}`);
        }
    }
    function openPreparedGame() {
        if (!preparedGameReady()) {
            refreshPreparedGameControls();
            showToast("请先点击“准备桥接”");
            return;
        }
        try {
            const processHandle = childProcess.spawn("cmd.exe", ["/c", preparedGameLauncherPath], {
                cwd: preparedGameDir,
                detached: true,
                stdio: "ignore"
            });
            processHandle.unref();
            gameProcess = processHandle;
            showToast("已打开准备好的游戏");
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(`打开游戏失败：${message}`);
        }
    }
    function openFolder(folder) {
        try {
            fs.mkdirSync(folder, { recursive: true });
            nw.Shell.openItem(folder);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showToast(message);
        }
    }
    function copyDirectory(source, target) {
        fs.mkdirSync(target, { recursive: true });
        for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
            const src = path.join(source, entry.name);
            const dst = path.join(target, entry.name);
            if (entry.isDirectory())
                copyDirectory(src, dst);
            else
                fs.copyFileSync(src, dst);
        }
    }
    function backupSaves() {
        if (!fs.existsSync(saveDir)) {
            showToast("没有找到存档目录");
            return;
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const target = path.join(projectRoot, "output", "backup", "save", stamp);
        copyDirectory(saveDir, target);
        showToast("存档已备份");
        openFolder(target);
    }
    function clearEvents() {
        NwrGuiBridgeIO.clearEvents(fs, bridgePaths);
        lastEventSize = 0;
        renderEvents([]);
        showToast("事件已清空");
    }
    function sendOptions(options, controlId = "ratesApplyBtn") {
        sendCommand(NwrGuiBridgeCommands.trainerOptionsSet(options), controlId);
    }
    function sendDiagnosticCommand(id) {
        const definition = NwrGuiDiagnostics.diagnosticById(id);
        if (!definition) {
            showToast("未知诊断命令");
            return;
        }
        const payload = sendCommand(NwrGuiDiagnostics.commandForDiagnostic(definition.id));
        if (!payload)
            return;
        dom.diagnosticState.textContent = `${definition.label} -> ${payload.commandId}`;
    }
    function selectItem(kind, id, keepChooser = false) {
        selectedItemKind = kind;
        if (!keepChooser)
            $("itemKind").value = kind;
        const chooserKind = $("itemKind").value;
        $("itemId").setAttribute("list", `${chooserKind}Options`);
        $("itemId").value = chooserKind === "all" ? `${kind}:${id}` : String(id);
        updateLookupHints();
        renderItemList();
    }
    function selectActor(id) {
        $("actorId").value = String(id);
        $("skillActorId").value = String(id);
        const actorName = NwrGuiCatalog.catalogName(catalogs, "actor", Number(id));
        if (actorName)
            $("actorName").value = actorName;
        updateLookupHints();
        renderActorList();
    }
    function selectSkill(id) {
        $("skillId").value = String(id);
        updateLookupHints();
        renderSkillList();
    }
    function selectVariable(id) {
        $("variableId").value = String(id);
        updateLookupHints();
        renderVariableList();
    }
    function selectSwitch(id, value = switchValue) {
        $("switchId").value = String(id);
        if (value !== undefined) {
            switchValue = !!value;
            $("switchOnBtn").classList.toggle("active", switchValue);
            $("switchOffBtn").classList.toggle("active", !switchValue);
        }
        updateLookupHints();
        renderSwitchList();
    }
    function selectMap(id) {
        $("mapId").value = String(id);
        updateLookupHints();
        renderMapList();
    }
    function selectCommonEvent(id) {
        $("commonEventId").value = String(id);
        updateLookupHints();
        renderCommonEventList();
    }
    function addItem(kind, id) {
        selectItem(kind, id, $("itemKind").value === "all");
        sendCommand(NwrGuiBridgeCommands.itemAdd(kind, Number(id), numberValue("itemAmount", 1)), "itemAddBtn");
    }
    function unlockActor(id) {
        selectActor(id);
        sendCommand(NwrGuiBridgeCommands.actorUnlock(Number(id)), "actorUnlockBtn");
    }
    function setActorName(id) {
        const name = String($("actorName").value || "").trim();
        if (!name) {
            showToast("请输入角色名称");
            return;
        }
        sendCommand(NwrGuiBridgeCommands.actorNameSet(Number(id), name), "actorNameBtn");
    }
    function learnSkill(id) {
        selectSkill(id);
        sendCommand(NwrGuiBridgeCommands.actorSkillLearn(skillActorId(), Number(id)), "skillLearnBtn");
    }
    function forgetSkill(id) {
        selectSkill(id);
        sendCommand(NwrGuiBridgeCommands.actorSkillForget(skillActorId(), Number(id)), "skillForgetBtn");
    }
    function setVariable(id) {
        selectVariable(id);
        sendCommand(NwrGuiBridgeCommands.variableSet(Number(id), parseValue($("variableValue").value)), "variableSetBtn");
    }
    function setSwitch(id, value) {
        selectSwitch(id, value);
        sendCommand(NwrGuiBridgeCommands.switchSet(Number(id), !!value), "switchSetBtn");
    }
    function transferMap(id, controlId = "mapTransferBtn") {
        selectMap(id);
        sendCommand(NwrGuiBridgeCommands.mapTransfer(Number(id), numberValue("mapX", 10), numberValue("mapY", 10), numberValue("mapDirection", 2), numberValue("mapFade", 0)), controlId);
    }
    function runCommonEvent(id) {
        selectCommonEvent(id);
        sendCommand(NwrGuiBridgeCommands.commonEventRun(Number(id)), "commonEventRunBtn");
    }
    function handleCatalogClick(event) {
        const actionButton = event.target.closest("[data-catalog-action]");
        const row = event.target.closest(".catalog-row");
        if (!row)
            return;
        const id = Number(row.dataset.id);
        const kind = row.dataset.kind;
        if (!actionButton) {
            if (kind === "item" || kind === "weapon" || kind === "armor")
                selectItem(kind, id, $("itemKind").value === "all");
            else if (kind === "skill")
                selectSkill(id);
            else if (kind === "actor")
                selectActor(id);
            else if (kind === "variable")
                selectVariable(id);
            else if (kind === "switch")
                selectSwitch(id);
            else if (kind === "map")
                selectMap(id);
            else if (kind === "commonEvent")
                selectCommonEvent(id);
            return;
        }
        const action = actionButton.dataset.catalogAction;
        if (action === "item-add")
            addItem(kind, id);
        else if (action === "skill-learn")
            learnSkill(id);
        else if (action === "skill-forget")
            forgetSkill(id);
        else if (action === "actor-unlock")
            unlockActor(id);
        else if (action === "actor-select")
            selectActor(id);
        else if (action === "variable-select")
            selectVariable(id);
        else if (action === "variable-set")
            setVariable(id);
        else if (action === "switch-on")
            setSwitch(id, true);
        else if (action === "switch-off")
            setSwitch(id, false);
        else if (action === "map-transfer")
            transferMap(id);
        else if (action === "common-event-run")
            runCommonEvent(id);
    }
    function applyRuntimeState(state) {
        latestState = state;
        maybeRequestRuntimeIconExport(state);
        const view = NwrGuiRuntimeState.renderState(state, { expectedBridgeVersion: EXPECTED_BRIDGE_VERSION });
        applyRuntimeStatus(view.status);
        dom.bridgeState.textContent = view.bridgeText;
        dom.partyState.textContent = view.partyState;
        dom.goldState.textContent = formatNumber(view.goldState);
        dom.goldMetric.textContent = formatNumber(view.goldMetric);
        dom.saveState.textContent = view.saveState;
        dom.mapState.textContent = view.mapState;
        dom.saveFiles.innerHTML = saveFilesHtml(view.saveFiles, view.hasState);
        dom.partyMembers.innerHTML = partyMembersHtml(view.partyMembers, view.hasState);
        NwrGuiPrisonGuards.applyPanel({
            summary: dom.prisonGuardSummary,
            metrics: dom.prisonGuardMetrics,
            list: dom.prisonGuardList,
            repairButton: dom.prisonRepairBtn
        }, NwrGuiPrisonGuards.reportFromState(state), view.fresh && view.versionOk && view.hasParty);
        refreshPreparedGameControls();
        if (!view.hasState) {
            dom.battleState.textContent = "";
            return;
        }
        const options = view.fresh ? (state.trainerOptions || {}) : {};
        if (view.fresh)
            updateOptionInputs(options);
        updateBattleButtons(options, view.fresh && state.hooksPatched, view.fresh ? state.rateStats : null, view.fresh ? state.battleStats : null);
    }
    function updateOptionInputs(options) {
        [["expRate", options.expRate], ["goldRate", options.goldRate], ["dropRate", options.dropRate]].forEach(([id, value]) => {
            const input = $(id);
            if (document.activeElement !== input && value != null)
                input.value = value;
        });
    }
    function updateBattleButtons(options, hooksPatched, rateStats, battleStats) {
        $("noCostBtn").classList.toggle("active", !!options.noSkillCost);
        $("oneHitKillBtn").classList.toggle("active", !!options.oneHitKill);
        $("invincibleBtn").classList.toggle("active", !!options.invincible);
        const noCost = options.noSkillCost ? "无耗ON" : "无耗OFF";
        const oneHit = options.oneHitKill ? "秒杀ON" : "秒杀OFF";
        const invincible = options.invincible ? "无敌ON" : "无敌OFF";
        const last = rateStats && rateStats.last
            ? `倍率命中 ${rateStats.last.name}`
            : "倍率未命中";
        const battle = battleStats && battleStats.last
            ? `战斗命令 ${battleStats.last.name}`
            : "等待战斗命中";
        dom.battleState.textContent = `${noCost} / ${oneHit} / ${invincible} / hooks ${hooksPatched ? "OK" : "--"} / ${last} / ${battle}`;
    }
    function renderEvents(events) {
        dom.eventList.innerHTML = NwrGuiRuntimeEvents.eventListHtml(events);
    }
    function bridgeEventRecord(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    }
    function processRuntimeIconEvents(events) {
        for (const value of events.slice().reverse()) {
            const event = bridgeEventRecord(value);
            if (!event || event.type !== "asset.iconSet.export")
                continue;
            if (event.ok === false) {
                iconExportRequested = false;
                return;
            }
            const payload = bridgeEventRecord(event.payload);
            if (payload && payload.scheduled === true) {
                iconExportRequested = true;
                return;
            }
            iconExportRequested = false;
            if (!iconExportCompleted) {
                iconExportCompleted = true;
                iconCache.clear();
                setupIconSet();
            }
            return;
        }
    }
    function maybeRequestRuntimeIconExport(state) {
        if (iconExportCompleted || iconExportRequested || exportedIconSetReady() || iconSetImage)
            return;
        if (!state || state.hasDataManager !== true)
            return;
        const now = Date.now();
        if (now - iconExportLastAttemptMs < ICON_EXPORT_RETRY_MS)
            return;
        iconExportRequested = true;
        iconExportLastAttemptMs = now;
        sendCommand({ type: "asset.iconSet.export" }, "runtimeIconExport", { silent: true });
    }
    function refresh() {
        const state = readJson(bridgePaths.statePath);
        applyRuntimeState(state);
        try {
            const size = NwrGuiBridgeIO.eventSize(fs, bridgePaths);
            if (size !== lastEventSize) {
                lastEventSize = size;
                const events = NwrGuiBridgeIO.readEvents(fs, bridgePaths);
                renderEvents(events);
                processRuntimeIconEvents(events);
            }
        }
        catch {
            renderEvents([]);
        }
    }
    function activateTab(tab, options = {}) {
        activeToolTab = tab || "core";
        document.querySelectorAll("[data-tool-tab]").forEach((button) => {
            button.classList.toggle("active", button.dataset.toolTab === activeToolTab);
        });
        ensureActiveToolSection(activeToolTab);
        updateVisiblePanels();
        requestAnimationFrame(() => {
            if (!options.keepScroll)
                scrollActiveToolAreaToTop();
            renderActiveCatalogs();
        });
    }
    function recordCurrentPosition() {
        const map = latestState && latestState.currentMap;
        if (!map || !map.mapId) {
            showToast("还没有读取到当前位置");
            return;
        }
        recordedPosition = {
            mapId: Number(map.mapId),
            x: Number(map.x || 0),
            y: Number(map.y || 0),
            direction: Number(map.direction || 2),
            fade: 0
        };
        $("recordedPosition").textContent = `${recordedPosition.mapId} (${recordedPosition.x}, ${recordedPosition.y})`;
        showToast("已记录当前位置");
    }
    function returnRecordedPosition() {
        if (!recordedPosition) {
            showToast("还没有记录位置");
            return;
        }
        $("mapId").value = String(recordedPosition.mapId);
        $("mapX").value = String(recordedPosition.x);
        $("mapY").value = String(recordedPosition.y);
        $("mapDirection").value = String(recordedPosition.direction);
        $("mapFade").value = String(recordedPosition.fade);
        updateLookupHints();
        transferMap(recordedPosition.mapId, "returnPositionBtn");
    }
    function bind() {
        document.querySelectorAll("[data-tool-tab]").forEach((button) => {
            button.addEventListener("click", () => activateTab(button.dataset.toolTab, { keepScroll: true }));
        });
        dom.toolSectionNav.addEventListener("click", (event) => {
            const button = event.target.closest("[data-tool-section-jump]");
            if (!button)
                return;
            activateToolSection(button.dataset.toolSectionJump || "", { keepScroll: true });
        });
        dom.launchBtn.addEventListener("click", launchGame);
        dom.openPreparedGameBtn.addEventListener("click", openPreparedGame);
        dom.refreshBtn.addEventListener("click", refresh);
        dom.openDiagnosticsBtn.addEventListener("click", () => activateTab("debug"));
        dom.itemList.addEventListener("click", handleCatalogClick);
        dom.skillList.addEventListener("click", handleCatalogClick);
        dom.actorList.addEventListener("click", handleCatalogClick);
        dom.variableList.addEventListener("click", handleCatalogClick);
        dom.switchList.addEventListener("click", handleCatalogClick);
        dom.mapList.addEventListener("click", handleCatalogClick);
        dom.commonEventList.addEventListener("click", handleCatalogClick);
        bindVirtualScroll(dom.itemList);
        bindVirtualScroll(dom.skillList);
        bindVirtualScroll(dom.actorList);
        bindVirtualScroll(dom.variableList);
        bindVirtualScroll(dom.switchList);
        bindVirtualScroll(dom.mapList);
        bindVirtualScroll(dom.commonEventList);
        setupCatalogTools();
        bindViewportResize();
        $("goldSetBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.goldSet(Number($("goldValue").value || 0)), "goldSetBtn"));
        $("goldAddBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.goldAdd(Number($("goldValue").value || 0)), "goldAddBtn"));
        document.querySelectorAll("[data-gold-add]").forEach((button) => {
            button.addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.goldAdd(Number(button.dataset.goldAdd)), "selector:data-gold-add"));
        });
        document.querySelectorAll("[data-gold-set]").forEach((button) => {
            button.addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.goldSet(Number(button.dataset.goldSet)), "selector:data-gold-set"));
        });
        $("variableSetBtn").addEventListener("click", () => setVariable(numberValue("variableId", 0)));
        $("switchOnBtn").addEventListener("click", () => {
            switchValue = true;
            $("switchOnBtn").classList.add("active");
            $("switchOffBtn").classList.remove("active");
        });
        $("switchOffBtn").addEventListener("click", () => {
            switchValue = false;
            $("switchOffBtn").classList.add("active");
            $("switchOnBtn").classList.remove("active");
        });
        $("switchSetBtn").addEventListener("click", () => setSwitch(numberValue("switchId", 0), switchValue));
        $("itemAddBtn").addEventListener("click", () => {
            const selection = parseItemSelection();
            sendCommand(NwrGuiBridgeCommands.itemAdd(selection.kind, selection.id, numberValue("itemAmount", 1)), "itemAddBtn");
        });
        $("actorUnlockBtn").addEventListener("click", () => unlockActor(activeActorId()));
        $("actorAddBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorAdd(activeActorId()), "actorAddBtn"));
        $("actorRemoveBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorRemove(activeActorId()), "actorRemoveBtn"));
        $("actorRecoverBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorRecover(activeActorId()), "actorRecoverBtn"));
        $("actorNameBtn").addEventListener("click", () => setActorName(activeActorId()));
        $("actorLevelBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorLevelSet(activeActorId(), numberValue("actorLevel", 1)), "actorLevelBtn"));
        $("actorExpBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorExpAdd(activeActorId(), numberValue("actorExp", 0)), "actorExpBtn"));
        $("actorVitalsBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorVitalsSet(activeActorId(), optionalNumber("actorHp"), optionalNumber("actorMp"), optionalNumber("actorTp")), "actorVitalsBtn"));
        $("actorParamBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorParamAdd(activeActorId(), numberValue("paramId", 0), numberValue("paramValue", 0)), "actorParamBtn"));
        $("actorSpBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorJpAdd(activeActorId(), numberValue("actorSpValue", 0), actorPointClassId()), "actorSpBtn"));
        $("actorAllocationPointsBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorAllocationPointsAdd(activeActorId(), numberValue("actorAllocationPointValue", 0), actorPointClassId()), "actorAllocationPointsBtn"));
        $("skillLearnBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorSkillLearn(skillActorId(), numberValue("skillId", 0)), "skillLearnBtn"));
        $("skillForgetBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.actorSkillForget(skillActorId(), numberValue("skillId", 0)), "skillForgetBtn"));
        $("ratesApplyBtn").addEventListener("click", () => sendOptions({
            expRate: numberValue("expRate", 1),
            goldRate: numberValue("goldRate", 1),
            dropRate: numberValue("dropRate", 1)
        }, "ratesApplyBtn"));
        document.querySelectorAll("[data-rate]").forEach((button) => {
            button.addEventListener("click", () => {
                const rate = Number(button.dataset.rate || 1);
                $("expRate").value = String(rate);
                $("goldRate").value = String(rate);
                $("dropRate").value = String(rate);
                sendOptions({ expRate: rate, goldRate: rate, dropRate: rate }, "selector:data-rate");
            });
        });
        $("noCostBtn").addEventListener("click", () => sendOptions({ noSkillCost: !$("noCostBtn").classList.contains("active") }, "noCostBtn"));
        $("oneHitKillBtn").addEventListener("click", () => sendOptions({ oneHitKill: !$("oneHitKillBtn").classList.contains("active") }, "oneHitKillBtn"));
        $("invincibleBtn").addEventListener("click", () => sendOptions({ invincible: !$("invincibleBtn").classList.contains("active") }, "invincibleBtn"));
        $("battleKillBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.battleKillEnemies(), "battleKillBtn"));
        $("battleEscapeBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.battleEscape(), "battleEscapeBtn"));
        $("partyRecoverBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.partyRecover(), "partyRecoverBtn"));
        dom.prisonRepairBtn.addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.prisonRepair(), "prisonRepairBtn"));
        $("mapTransferBtn").addEventListener("click", () => transferMap(numberValue("mapId", 0)));
        $("recordPositionBtn").addEventListener("click", recordCurrentPosition);
        $("returnPositionBtn").addEventListener("click", returnRecordedPosition);
        $("commonEventRunBtn").addEventListener("click", () => runCommonEvent(numberValue("commonEventId", 0)));
        $("saveGameBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.save(Number($("saveSlot").value || 1)), "saveGameBtn"));
        $("titleRefreshBtn").addEventListener("click", () => sendCommand(NwrGuiBridgeCommands.titleRefresh(), "titleRefreshBtn"));
        document.querySelectorAll("[data-diagnostic-command]").forEach((button) => {
            button.addEventListener("click", () => sendDiagnosticCommand(button.dataset.diagnosticCommand || ""));
        });
        $("customSendBtn").addEventListener("click", () => {
            try {
                const command = JSON.parse($("customCommand").value);
                sendCommand(command, "customSendBtn");
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                showToast(`JSON 错误：${message}`);
            }
        });
        $("openBridgeBtn").addEventListener("click", () => openFolder(bridgePaths.bridgeDir));
        $("openSaveBtn").addEventListener("click", () => openFolder(saveDir));
        $("backupSaveBtn").addEventListener("click", backupSaves);
        $("clearEventsBtn").addEventListener("click", clearEvents);
    }
    setupCatalogs();
    setupRuntimeRoutes();
    bind();
    activateTab(activeToolTab);
    resetRestoredPageScroll();
    refreshPreparedGameControls();
    refresh();
    setInterval(refresh, 700);
    loadCatalogAssetsAfterFirstPaint();
})();
