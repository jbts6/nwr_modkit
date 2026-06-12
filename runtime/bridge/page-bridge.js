(function () {
  if (window.__codexLocalTrainerBridge) return;

  const bridge = {
    version: "0.2.32",
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    processed: Object.create(null),
    originals: Object.create(null),
    options: {
      expRate: 1,
      goldRate: 1,
      dropRate: 1,
      noSkillCost: false,
      oneHitKill: false,
      invincible: false
    },
    rateDepth: 0,
    suppressRates: 0,
    noCostDepth: 0,
    suppressNoCost: 0,
    suppressInvincible: 0,
    noCostBaselines: Object.create(null),
    rateStats: Object.create(null),
    battleStats: Object.create(null),
    hookTargets: [],
    hooksPatched: false,
    schedulers: [],
    lastError: null
  };
  window.__codexLocalTrainerBridge = bridge;

  function tryRequire(name) {
    try {
      if (typeof require === "function") return require(name);
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
    }
    return null;
  }

  const fs = tryRequire("fs");
  const path = tryRequire("path");
  const nodeTimers = tryRequire("timers");
  const nodeBuffer = tryRequire("buffer");
  if (!fs || !path || typeof process === "undefined") {
    bridge.lastError = "Node require/process is unavailable in page context";
    return;
  }

  const bridgeConfig = window.__codexBridgeConfig || {};
  const gameRoot = bridgeConfig.gameRoot || process.env.DQ2_GAME_ROOT || process.cwd();
  const projectRoot = bridgeConfig.projectRoot || process.env.DQ2_MODKIT_ROOT || path.join(gameRoot, "dq2_modkit");
  const bridgeDir = path.join(projectRoot, "runtime", "bridge-state");
  const saveDir = path.join(gameRoot, "www", "save");
  const dataDir = path.join(projectRoot, "output", "extract", "data");
  const dataDumpOutputRoots = [
    path.join(projectRoot, "output"),
    path.join(gameRoot, ".omo", "evidence")
  ];
  const commandPath = path.join(bridgeDir, "commands.jsonl");
  const eventPath = path.join(bridgeDir, "events.jsonl");
  const statePath = path.join(bridgeDir, "state.json");
  const logPath = path.join(bridgeDir, "bridge.log");
  const dataCache = Object.create(null);
  const PRISON_NUMERIC_GUARDS = [
    { id: "armor-400", group: "直接传送", label: "至尊魔戒数量", kind: "armor", bagName: "_armors", itemId: 400, limit: 3, safeValue: 2, effect: "CE334：提示终身监禁，Switch520 ON，禁用存档，传送 Map695" },
    { id: "item-656", group: "直接传送", label: "传说的灵魂结晶", kind: "item", bagName: "_items", itemId: 656, limit: 200, safeValue: 199, effect: "CE337：提示终身监禁，Switch520 ON，禁用存档，传送 Map695" },
    { id: "item-653", group: "直接传送", label: "红色萃取精华", kind: "item", bagName: "_items", itemId: 653, limit: 200, safeValue: 199, effect: "CE338：提示终身监禁，Switch520 ON，禁用存档，传送 Map695" },
    { id: "item-654", group: "直接传送", label: "橙色萃取精华", kind: "item", bagName: "_items", itemId: 654, limit: 80, safeValue: 79, effect: "CE339：提示终身监禁，Switch520 ON，禁用存档，传送 Map695" },
    { id: "gold", group: "直接传送", label: "金币", kind: "gold", bagName: "", itemId: 0, limit: 9000000, safeValue: 8999999, effect: "CE340：提示终身监禁，Switch520 ON，禁用存档，传送 Map695" },
    { id: "var-29", group: "直接传送", label: "功勋变量", kind: "variable", bagName: "", itemId: 29, limit: 5000, safeValue: 4999, effect: "CE341：提示终身监禁，Switch520 ON，禁用存档，传送 Map695" },
    { id: "item-730", group: "直接传送", label: "浮世绘卷", kind: "item", bagName: "_items", itemId: 730, limit: 2, safeValue: 1, effect: "CE342/343：提示终身监禁，Switch520 ON，禁用存档，传送 Map695" },
    { id: "var-210", group: "只开惩处", label: "针剂进化次数", kind: "variable", bagName: "", itemId: 210, limit: 99, safeValue: 98, effect: "CE335：Switch520 ON，禁用存档" },
    { id: "item-45", group: "只开惩处", label: "全面进化针剂", kind: "item", bagName: "_items", itemId: 45, limit: 99, safeValue: 98, effect: "CE336：Switch520 ON，禁用存档" }
  ];
  const PRISON_MISSING_ITEM_GUARDS = [
    { id: "ce-403-actor-16-item-49", group: "只开惩处", label: "角色 16 缺少关键物品 49", actorId: 16, itemId: 49, actorName: "(blank)", itemName: "(blank)", commonEventId: 403, effect: "CE403：Switch166 ON，Switch520 ON，禁用存档" },
    { id: "ce-405-actor-16-item-59", group: "直接传送", label: "闯帝判定关键物品", actorId: 16, itemId: 59, actorName: "(blank)", itemName: "赤炎魔杖", commonEventId: 405, effect: "CE405：梦魇传送处提示，Switch785 ON；提示终身监禁，Switch520 ON，禁用存档，传送 Map695" },
    { id: "ce-406-actor-57-item-819", group: "只开惩处", label: "天道佩恩判定关键物品", actorId: 57, itemId: 819, actorName: "立花野子", itemName: "东乙青木橛", commonEventId: 406, effect: "CE406：梦魇传送处提示，Switch781 ON，Switch520 ON，禁用存档" },
    { id: "ce-407-actor-48-item-73", group: "只开惩处", label: "冥主喵喵判定关键物品", actorId: 48, itemId: 73, actorName: "圣女-贞德", itemName: "圆润的珠子", commonEventId: 407, effect: "CE407：梦魇传送处提示，Switch784 ON，Switch520 ON，禁用存档" },
    { id: "ce-571-actor-57-item-101", group: "只开惩处", label: "角色 57 缺少关键物品 101", actorId: 57, itemId: 101, actorName: "立花野子", itemName: "(blank)", commonEventId: 571, effect: "CE571：梦魇传送处提示，Switch781 ON，Switch520 ON，禁用存档" },
    { id: "ce-572-actor-31-item-860", group: "只开惩处", label: "角色 31 缺少关键物品 860", actorId: 31, itemId: 860, actorName: "(blank)", itemName: "(blank)", commonEventId: 572, effect: "CE572：梦魇传送处提示，Switch1067 ON，Switch520 ON，禁用存档" }
  ];
  bridge.lastDataReadPath = "";
  bridge.currentDataUrl = "";

  function ensureDir() {
    try {
      fs.mkdirSync(bridgeDir, { recursive: true });
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
    }
  }

  function isInsidePath(child, parent) {
    const resolvedChild = path.resolve(child);
    const resolvedParent = path.resolve(parent);
    const relative = path.relative(resolvedParent, resolvedChild);
    return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  }

  function resolveDataDumpOutputDir(value) {
    const outputDir = value
      ? path.resolve(projectRoot, String(value))
      : dataDir;
    if (!dataDumpOutputRoots.some((root) => isInsidePath(outputDir, root))) {
      throw new Error("data.dump outputDir must be inside nwr_modkit/output or .omo/evidence");
    }
    return outputDir;
  }

  function append(file, value) {
    ensureDir();
    fs.appendFileSync(file, JSON.stringify(value) + "\n", "utf8");
  }

  function log(message, extra) {
    ensureDir();
    const line = `[${new Date().toISOString()}] ${message}${extra ? " " + JSON.stringify(extra) : ""}\n`;
    fs.appendFileSync(logPath, line, "utf8");
  }

  function installRuntimeSignalSpoofing() {
    const gamePackagePath = path.join(gameRoot, "package.json");
    const trainerPackagePath = path.join(projectRoot, "runtime", "trainer", "package.json");
    bridge.runtimeSpoof = {
      gameRoot,
      projectRoot,
      cwdBefore: process.cwd(),
      execPathBefore: process.execPath,
      trainerPackagePath
    };

    try {
      process.cwd = function () { return gameRoot; };
      bridge.runtimeSpoof.cwd = process.cwd();
    } catch (error) {
      bridge.runtimeSpoof.cwdError = String(error && error.stack || error).split("\n")[0];
    }

    try {
      Object.defineProperty(process, "execPath", {
        configurable: true,
        get() { return path.join(gameRoot, "Game.exe"); }
      });
      bridge.runtimeSpoof.execPath = process.execPath;
    } catch (error) {
      bridge.runtimeSpoof.execPathError = String(error && error.stack || error).split("\n")[0];
    }

    try {
      Object.defineProperty(process.versions, "nw-flavor", {
        configurable: true,
        value: "normal"
      });
      bridge.runtimeSpoof.nwFlavor = process.versions["nw-flavor"];
    } catch (error) {
      bridge.runtimeSpoof.nwFlavorError = String(error && error.stack || error).split("\n")[0];
    }

    try {
      if (window.nw && nw.App && fs.existsSync(gamePackagePath)) {
        const gameManifest = JSON.parse(fs.readFileSync(gamePackagePath, "utf8"));
        Object.defineProperty(nw.App, "manifest", {
          configurable: true,
          get() { return gameManifest; }
        });
        bridge.runtimeSpoof.manifestName = gameManifest.name || "";
      }
    } catch (error) {
      bridge.runtimeSpoof.manifestError = String(error && error.stack || error).split("\n")[0];
    }

    try {
      const nativeClient = {
        name: "Native Client",
        filename: "internal-nacl-plugin",
        description: "Native Client"
      };
      nativeClient.toString = function () { return "[object Plugin]"; };
      const namedItem = function (name) {
        if (String(name) === "Native Client") return nativeClient;
        return null;
      };
      namedItem.toString = function () { return "function namedItem() { [native code] }"; };
      Object.defineProperty(navigator, "plugins", {
        configurable: true,
        value: { namedItem, length: 1, 0: nativeClient }
      });
      bridge.runtimeSpoof.nativeClient = !!navigator.plugins.namedItem("Native Client");
    } catch (error) {
      bridge.runtimeSpoof.nativeClientError = String(error && error.stack || error).split("\n")[0];
    }

    try {
      if (!fs.__codexRuntimeSpoofPackageRedirect) {
        for (const method of ["readFileSync", "existsSync", "statSync"]) {
          const original = fs[method];
          if (typeof original !== "function") continue;
          fs[method] = function () {
            const args = Array.from(arguments);
            try {
              if (args[0] && path.resolve(String(args[0])) === trainerPackagePath) {
                args[0] = gamePackagePath;
              }
            } catch (_) {}
            return original.apply(this, args);
          };
        }
        fs.__codexRuntimeSpoofPackageRedirect = true;
      }
    } catch (error) {
      bridge.runtimeSpoof.packageRedirectError = String(error && error.stack || error).split("\n")[0];
    }
  }

  if (bridgeConfig.runtimeSpoof === false) {
    bridge.runtimeSpoof = { disabled: true };
  } else {
    installRuntimeSignalSpoofing();
  }

  function dataFileNameFromUrl(url) {
    const text = String(url || "").replace(/\\/g, "/");
    const match = text.match(/(?:^|\/)data\/([^/?#]+\.json)(?:[?#].*)?$/i);
    if (!match) return "";
    try {
      const decoded = decodeURIComponent(match[1]);
      return path.basename(decoded) === decoded ? decoded : "";
    } catch (_) {
      return match[1];
    }
  }

  function maybeDumpParsedData(source, value, rawText) {
    try {
      const fileName = dataFileNameFromUrl(source);
      if (!fileName || value == null || typeof value !== "object") return;
      const text = String(rawText || "");
      if (!/^\s*[\[{]/.test(text)) return;
      fs.mkdirSync(dataDir, { recursive: true });
      const outputPath = path.join(dataDir, fileName);
      fs.writeFileSync(outputPath, `${JSON.stringify(value, jsonSafeReplacer(), 2)}\n`, "utf8");
      log("dumped parsed data", {
        source,
        output: outputPath,
        bytes: fs.statSync(outputPath).size
      });
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("dump parsed data failed", { source, error: bridge.lastError });
    }
  }

  function installEarlyDataHooks() {
    try {
      if (!XMLHttpRequest.prototype.__codexDataDumpOpen) {
        const open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
          try {
            this.__codexDataUrl = String(url || "");
          } catch (_) {}
          return open.apply(this, arguments);
        };
        XMLHttpRequest.prototype.__codexDataDumpOpen = true;
      }

      if (!XMLHttpRequest.prototype.__codexDataDumpSend) {
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function () {
          try {
            if (typeof this.onload === "function" && !this.onload.__codexWrapped) {
              const xhr = this;
              const onload = this.onload;
              this.onload = function () {
                const previous = bridge.currentDataUrl;
                bridge.currentDataUrl = xhr.__codexDataUrl || "";
                try {
                  return onload.apply(this, arguments);
                } finally {
                  bridge.currentDataUrl = previous;
                }
              };
              this.onload.__codexWrapped = true;
            }
          } catch (_) {}
          return send.apply(this, arguments);
        };
        XMLHttpRequest.prototype.__codexDataDumpSend = true;
      }
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("xhr hook failed", { error: bridge.lastError });
    }

    try {
      if (!fs.__codexDataDumpReadFileSync) {
        const readFileSync = fs.readFileSync;
        fs.readFileSync = function (file) {
          const result = readFileSync.apply(this, arguments);
          try {
            const fileText = String(file || "").replace(/\\/g, "/");
            if (/(?:^|\/)data\/[^/?#]+\.json$/i.test(fileText)) {
              bridge.lastDataReadPath = fileText;
            }
          } catch (_) {}
          return result;
        };
        fs.__codexDataDumpReadFileSync = true;
      }
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("fs hook failed", { error: bridge.lastError });
    }

    try {
      if (!JSON.__codexDataDumpParse) {
        const parse = JSON.parse;
        JSON.parse = function (text, reviver) {
          const value = parse.apply(this, arguments);
          const source = bridge.currentDataUrl || bridge.lastDataReadPath || "";
          maybeDumpParsedData(source, value, text);
          return value;
        };
        JSON.__codexDataDumpParse = true;
      }
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("json hook failed", { error: bridge.lastError });
    }
  }

  function readDataJson(fileName) {
    try {
      if (dataCache[fileName]) return dataCache[fileName];
      const file = path.join(dataDir, fileName);
      if (!fs.existsSync(file)) return null;
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      dataCache[fileName] = value;
      return value;
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      return null;
    }
  }

  function event(command, ok, payload) {
    append(eventPath, {
      ts: Date.now(),
      commandId: command && command.__codexQueueId || commandQueueId(command),
      type: command && command.type,
      ok,
      payload
    });
  }

  function callAlias(name) {
    try {
      const tk = window.TK && window.TK.$;
      const fn = tk && tk[name];
      if (typeof fn === "function") return fn();
      return null;
    } catch (_) {
      return null;
    }
  }

  function tkValue(name) {
    try {
      const tk = window.TK && window.TK.$;
      return tk && tk[name] || null;
    } catch (_) {
      return null;
    }
  }

  function uniqueTargets(targets) {
    const seen = [];
    return targets.filter((target) => {
      if (!target || !target.object || seen.includes(target.object)) return false;
      seen.push(target.object);
      return true;
    });
  }

  function resolveBattleManagers() {
    return uniqueTargets([
      { label: "TK.$.BattleMrg", object: tkValue("BattleMrg") },
      { label: "TK.$.BattleManager", object: tkValue("BattleManager") },
      { label: "window.BattleManager", object: window.BattleManager }
    ]);
  }

  function resolveSceneManager() {
    return tkValue("SceneMrg") || tkValue("SceneManager") || window.SceneManager || null;
  }

  function resolvePrototypeTargets(globalName, aliases) {
    const candidates = [{ label: `window.${globalName}`, object: window[globalName] }];
    aliases.forEach((name) => candidates.push({ label: `TK.$.${name}`, object: tkValue(name) }));
    return uniqueTargets(candidates
      .map((candidate) => {
        const ctor = candidate.object;
        return ctor && ctor.prototype ? { label: `${candidate.label}.prototype`, object: ctor.prototype } : null;
      }));
  }

  function runtimePrototypeTarget(label, object) {
    try {
      const prototype = object && Object.getPrototypeOf(object);
      return prototype ? { label, object: prototype } : null;
    } catch (_) {
      return null;
    }
  }

  function runtimePrototypeChainTargets(label, object, maxDepth) {
    const targets = [];
    try {
      let prototype = object && Object.getPrototypeOf(object);
      let depth = 1;
      while (prototype && prototype !== Object.prototype && depth <= maxDepth) {
        targets.push({ label: `${label}.prototype${depth}`, object: prototype });
        prototype = Object.getPrototypeOf(prototype);
        depth += 1;
      }
    } catch (_) {}
    return targets;
  }

  function partyMemberPrototypeTargets(label) {
    const party = resolveParty();
    const members = getPartyMembers(party);
    return members.flatMap((actor, index) => {
      const actorId = actorIdOf(actor) || index + 1;
      return runtimePrototypeChainTargets(`${label}.actor${actorId}`, actor, 5);
    });
  }

  function resolveParty() {
    return callAlias("gameParty") || window.$gameParty || null;
  }

  function resolveVariables() {
    return callAlias("gameVariables") || window.$gameVariables || null;
  }

  function resolveSwitches() {
    return callAlias("gameSwitches") || window.$gameSwitches || null;
  }

  function resolveActors() {
    return callAlias("gameActors") || window.$gameActors || null;
  }

  function resolveTroop() {
    return callAlias("gameTroop") || window.$gameTroop || null;
  }

  function resolveTemp() {
    return callAlias("gameTemp") || window.$gameTemp || null;
  }

  function resolveMap() {
    return callAlias("gameMap") || window.$gameMap || null;
  }

  function resolvePlayer() {
    return callAlias("gamePlayer") || window.$gamePlayer || null;
  }

  function resolveData(kind) {
    const names = {
      item: "dataItems",
      weapon: "dataWeapons",
      armor: "dataArmors",
      skill: "dataSkills",
      actor: "dataActors",
      enemy: "dataEnemies",
      troop: "dataTroops",
      mapInfo: "dataMapInfos"
    };
    const globals = {
      item: "$dataItems",
      weapon: "$dataWeapons",
      armor: "$dataArmors",
      skill: "$dataSkills",
      actor: "$dataActors",
      enemy: "$dataEnemies",
      troop: "$dataTroops",
      mapInfo: "$dataMapInfos"
    };
    return callAlias(names[kind]) || window[globals[kind]] || null;
  }

  function resolveCommonEvents() {
    return callAlias("dataCommonEvents") || window.$dataCommonEvents || null;
  }

  function resolveDataManager() {
    const tk = window.TK && window.TK.$;
    return tk && tk.DataMrg || window.DataManager || null;
  }

  function saveFilePath(savefileId) {
    const id = Number(savefileId);
    const fileName = id === 0 ? "global.rpgsave" : `file${id}.rpgsave`;
    return path.join(saveDir, fileName);
  }

  function patchStorageObject(storage, label) {
    if (!storage || storage.__codexSavePathPatched) return false;
    try {
      const original = {
        localFileDirectoryPath: storage.localFileDirectoryPath,
        localFilePath: storage.localFilePath,
        localFileExists: storage.localFileExists,
        localFileBackupExists: storage.localFileBackupExists,
        isLocalMode: storage.isLocalMode
      };
      Object.defineProperty(storage, "__codexOriginalStorage", {
        value: original,
        configurable: true
      });
      storage.localFileDirectoryPath = function () {
        return saveDir + path.sep;
      };
      storage.localFilePath = function (savefileId) {
        return saveFilePath(savefileId);
      };
      storage.localFileExists = function (savefileId) {
        return fs.existsSync(saveFilePath(savefileId));
      };
      storage.localFileBackupExists = function (savefileId) {
        return fs.existsSync(saveFilePath(savefileId) + ".bak");
      };
      storage.isLocalMode = function () {
        return true;
      };
      Object.defineProperty(storage, "__codexSavePathPatched", {
        value: true,
        configurable: true
      });
      log("patched storage save path", { label, saveDir });
      return true;
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("storage patch failed", { label, error: bridge.lastError });
      return false;
    }
  }

  function patchSavePaths() {
    let patched = false;
    try {
      patched = patchStorageObject(window.StorageManager, "StorageManager") || patched;
      const tkStorage = window.TK && window.TK.$ && window.TK.$.StorageMrg;
      patched = patchStorageObject(tkStorage, "TK.$.StorageMrg") || patched;
      if (patched) writeState();
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
    }
    return patched;
  }

  function refreshTitleContinueCommand() {
    try {
      const dataManager = resolveDataManager();
      if (dataManager && typeof dataManager.loadGlobalInfo === "function") {
        dataManager._globalInfo = dataManager.loadGlobalInfo();
      }
      const sceneManager = resolveSceneManager();
      const scene = sceneManager && sceneManager._scene;
      const commandWindow = scene && scene._commandWindow;
      if (commandWindow && typeof commandWindow.refresh === "function") {
        commandWindow.refresh();
        if (typeof commandWindow.activate === "function") commandWindow.activate();
      }
      return true;
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      return false;
    }
  }

  function safeGold(party) {
    if (!party) return null;
    try {
      if (typeof party.gold === "function") return party.gold();
      if (typeof party._gold === "number") return party._gold;
    } catch (_) {}
    return null;
  }

  function toBool(value) {
    return value === true || value === "true" || value === 1 || value === "1";
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function bumpRateStat(name, payload) {
    bridge.rateStats[name] = Number(bridge.rateStats[name] || 0) + 1;
    if (payload) {
      bridge.rateStats.last = {
        name,
        ts: Date.now(),
        ...payload
      };
    }
  }

  function bumpBattleStat(name, payload) {
    bridge.battleStats[name] = Number(bridge.battleStats[name] || 0) + 1;
    if (payload) {
      bridge.battleStats.last = {
        name,
        ts: Date.now(),
        ...payload
      };
    }
  }

  function withRatesSuppressed(fn) {
    bridge.suppressRates += 1;
    try {
      return fn();
    } finally {
      bridge.suppressRates = Math.max(0, bridge.suppressRates - 1);
    }
  }

  function withRateContext(fn) {
    bridge.rateDepth += 1;
    try {
      return fn();
    } finally {
      bridge.rateDepth = Math.max(0, bridge.rateDepth - 1);
    }
  }

  function isInBattleRewardContext() {
    if (bridge.rateDepth > 0) return true;
    try {
      const party = resolveParty();
      if (party && typeof party.inBattle === "function" && party.inBattle()) return true;
    } catch (_) {}
    try {
      const managers = resolveBattleManagers();
      const battle = managers[0] && managers[0].object;
      if (battle && battle._phase && battle._phase !== "init") return true;
    } catch (_) {}
    return false;
  }

  function scaledPositiveAmount(amount, rate) {
    const number = Number(amount);
    if (!Number.isFinite(number) || number <= 0) return amount;
    return Math.max(0, Math.floor(number * rate));
  }

  function isActorBattler(battler) {
    try {
      if (!battler) return false;
      if (typeof battler.isActor === "function") return !!battler.isActor();
      return actorIdOf(battler) != null;
    } catch (_) {
      return false;
    }
  }

  function isEnemyBattler(battler) {
    try {
      return !!(battler && typeof battler.isEnemy === "function" && battler.isEnemy());
    } catch (_) {
      return false;
    }
  }

  function battlerHp(battler) {
    if (!battler) return 0;
    return Math.max(0, Number(battler.hp == null ? battler._hp : battler.hp) || 0);
  }

  function withInvincibleSuppressed(fn) {
    bridge.suppressInvincible += 1;
    try {
      return fn();
    } finally {
      bridge.suppressInvincible = Math.max(0, bridge.suppressInvincible - 1);
    }
  }

  function setBattlerHp(battler, value) {
    if (!battler) return;
    withInvincibleSuppressed(() => {
      if (typeof battler.setHp === "function") battler.setHp(value);
      else battler._hp = value;
    });
  }

  function shouldBlockHpDecrease(battler, value) {
    if (!bridge.options.invincible || bridge.suppressInvincible > 0) return false;
    if (!isActorBattler(battler) || !isInBattle()) return false;
    const next = Number(value);
    if (!Number.isFinite(next)) return false;
    return next < battlerHp(battler);
  }

  function restoreInvincibleHp(battler, snapshot, source) {
    if (!bridge.options.invincible || !isActorBattler(battler) || !Number.isFinite(snapshot)) return false;
    const current = battlerHp(battler);
    if (current >= snapshot) return false;
    setBattlerHp(battler, snapshot);
    refreshActor(battler);
    bumpBattleStat("invincibleRestore", { source, from: current, to: snapshot });
    return true;
  }

  function actorResourceSnapshot(actor) {
    return {
      mp: Number(actor && (actor.mp == null ? actor._mp : actor.mp) || 0),
      tp: Number(actor && (actor.tp == null ? actor._tp : actor.tp) || 0)
    };
  }

  function actorNoCostKey(actor, index) {
    const id = actorIdOf(actor);
    if (id != null) return `actor:${id}`;
    return `party:${index}`;
  }

  function setActorResource(actor, name, value) {
    const method = name === "mp" ? "setMp" : "setTp";
    const field = name === "mp" ? "_mp" : "_tp";
    withNoCostSuppressed(() => {
      if (actor && typeof actor[method] === "function") actor[method](value);
      else if (actor) actor[field] = value;
    });
  }

  function resetNoCostBaselines() {
    bridge.noCostBaselines = Object.create(null);
  }

  function preserveNoCostResources(reason) {
    resetNoCostBaselines();
    return { active: !!bridge.options.noSkillCost, restored: 0, reason };
  }

  function restoreActorResources(actor, snapshot, source) {
    if (!actor || !snapshot) return;
    const current = actorResourceSnapshot(actor);
    let restored = false;
    if (snapshot.mp > current.mp) {
      setActorResource(actor, "mp", snapshot.mp);
      restored = true;
    }
    if (snapshot.tp > current.tp) {
      setActorResource(actor, "tp", snapshot.tp);
      restored = true;
    }
    if (restored) {
      refreshActor(actor);
      bumpBattleStat("noSkillCostRestore", { source, mp: snapshot.mp, tp: snapshot.tp });
    }
  }

  function withNoCostPreserved(actor, source, fn) {
    return fn();
  }

  function withNoCostSuppressed(fn) {
    bridge.suppressNoCost += 1;
    try {
      return fn();
    } finally {
      bridge.suppressNoCost = Math.max(0, bridge.suppressNoCost - 1);
    }
  }

  function shouldBlockResourceDecrease(actor, value, resourceName) {
    return false;
  }

  function getPartyMembers(party) {
    if (!party) return [];
    try {
      if (typeof party.allMembers === "function") return party.allMembers().filter(Boolean);
      if (typeof party.members === "function") return party.members().filter(Boolean);
    } catch (_) {}
    return [];
  }

  function actorIdOf(actor) {
    if (!actor) return null;
    try {
      if (typeof actor.actorId === "function") return actor.actorId();
      return actor._actorId || null;
    } catch (_) {
      return null;
    }
  }

  function actorNameOf(actor) {
    if (!actor) return "";
    try {
      if (typeof actor.name === "function") return actor.name();
      const data = typeof actor.actor === "function" ? actor.actor() : null;
      return data && data.name || actor._name || "";
    } catch (_) {
      return "";
    }
  }

  function actorClassIdOf(actor) {
    if (!actor) return 0;
    try {
      if (typeof actor.currentClass === "function") {
        const current = actor.currentClass();
        const id = Number(current && current.id);
        if (Number.isFinite(id) && id > 0) return Math.floor(id);
      }
    } catch (_) {}
    const id = Number(actor._classId || 0);
    return Number.isFinite(id) && id > 0 ? Math.floor(id) : 0;
  }

  function resolveActorClassId(actor, requestedClassId) {
    if (requestedClassId !== undefined && requestedClassId !== "") {
      const id = Math.floor(requireNumber(requestedClassId, "classId"));
      if (id > 0) return id;
    }
    return actorClassIdOf(actor);
  }

  function actorNumberTableValue(table, classId) {
    if (!table || typeof table !== "object") return 0;
    const value = Number(table[classId] || 0);
    return Number.isFinite(value) ? Math.floor(value) : 0;
  }

  function ensureActorNumberTable(actor, property) {
    if (!actor[property] || typeof actor[property] !== "object" || Array.isArray(actor[property])) {
      actor[property] = {};
    }
    return actor[property];
  }

  function actorJpValue(actor, classId) {
    return actorNumberTableValue(actor && actor._jp, classId);
  }

  function actorAllocationInfo(actor, classId) {
    const bonus = actorNumberTableValue(actor && actor._bonusAllocationPoints, classId);
    const spent = actorNumberTableValue(actor && actor._spentAllocationPoints, classId);
    return {
      bonus,
      spent,
      available: Math.max(0, bonus - spent)
    };
  }

  function addActorJp(actor, classId, amount) {
    const table = ensureActorNumberTable(actor, "_jp");
    const current = actorNumberTableValue(table, classId);
    const next = Math.max(0, current + amount);
    table[classId] = next;
    return next;
  }

  function addActorAllocationPoints(actor, classId, amount) {
    const table = ensureActorNumberTable(actor, "_bonusAllocationPoints");
    const spent = actorNumberTableValue(actor && actor._spentAllocationPoints, classId);
    const current = actorNumberTableValue(table, classId);
    const next = Math.max(spent, current + amount);
    table[classId] = next;
    return actorAllocationInfo(actor, classId);
  }

  function actorInfo(actor) {
    if (!actor) return null;
    const classId = actorClassIdOf(actor);
    const allocation = actorAllocationInfo(actor, classId);
    let skills = [];
    try {
      if (typeof actor.skills === "function") {
        skills = actor.skills().filter(Boolean).map(skill => ({ id: skill.id, name: skill.name }));
      } else if (Array.isArray(actor._skills)) {
        skills = actor._skills.map(id => ({ id, name: "" }));
      }
    } catch (_) {}
    return {
      id: actorIdOf(actor),
      name: actorNameOf(actor),
      level: actor.level == null ? null : actor.level,
      hp: actor.hp == null ? null : actor.hp,
      mhp: actor.mhp == null ? null : actor.mhp,
      mp: actor.mp == null ? null : actor.mp,
      mmp: actor.mmp == null ? null : actor.mmp,
      tp: actor.tp == null ? null : actor.tp,
      classId,
      jp: actorJpValue(actor, classId),
      allocationPoints: allocation.available,
      allocationBonus: allocation.bonus,
      allocationSpent: allocation.spent,
      skills
    };
  }

  function currentMapInfo() {
    const map = resolveMap();
    const player = resolvePlayer();
    let mapId = null;
    let x = null;
    let y = null;
    let direction = null;
    try {
      if (map && typeof map.mapId === "function") mapId = map.mapId();
      else if (map && map._mapId != null) mapId = map._mapId;
    } catch (_) {}
    try {
      if (player) {
        x = readGameValue(player, "x", "_x");
        y = readGameValue(player, "y", "_y");
        direction = readGameValue(player, "direction", "_direction");
      }
    } catch (_) {}
    return {
      mapId,
      x,
      y,
      direction
    };
  }

  function battleManagerObject() {
    const managers = resolveBattleManagers();
    return managers.map(target => target.object).find(Boolean) || null;
  }

  function isInBattle() {
    try {
      const party = resolveParty();
      if (party && typeof party.inBattle === "function" && party.inBattle()) return true;
    } catch (_) {}
    try {
      const manager = battleManagerObject();
      if (manager && manager._phase && manager._phase !== "init") return true;
    } catch (_) {}
    return false;
  }

  function troopEnemies(aliveOnly) {
    const troop = resolveTroop();
    if (!troop) return [];
    try {
      if (aliveOnly && typeof troop.aliveMembers === "function") return troop.aliveMembers().filter(isEnemyBattler);
      if (typeof troop.members === "function") return troop.members().filter(isEnemyBattler);
    } catch (_) {}
    if (Array.isArray(troop._enemies)) return troop._enemies.filter(enemy => isEnemyBattler(enemy) && (!aliveOnly || battlerHp(enemy) > 0));
    return [];
  }

  function defeatEnemy(enemy, source) {
    if (!enemy || !isEnemyBattler(enemy) || battlerHp(enemy) <= 0) return false;
    try {
      if (typeof enemy.setHp === "function") enemy.setHp(0);
      else enemy._hp = 0;
      if (typeof enemy.die === "function") enemy.die();
      if (typeof enemy.performCollapse === "function") enemy.performCollapse();
      if (enemy.result && typeof enemy.result === "function") {
        const result = enemy.result();
        if (result) result.hpDamage = Math.max(Number(result.hpDamage || 0), 999999);
      }
      if (typeof enemy.refresh === "function") enemy.refresh();
      bumpBattleStat("oneHitKill", { source, enemyId: typeof enemy.enemyId === "function" ? enemy.enemyId() : enemy._enemyId });
      return true;
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      return false;
    }
  }

  function killBattleEnemies(command) {
    const enemies = troopEnemies(true);
    let count = 0;
    enemies.forEach(enemy => {
      if (defeatEnemy(enemy, "command")) count += 1;
    });
    const finish = command && Object.prototype.hasOwnProperty.call(command, "finish") ? toBool(command.finish) : true;
    if (count > 0 && finish) {
      try {
        const manager = battleManagerObject();
        if (manager && typeof manager.processVictory === "function") manager.processVictory();
      } catch (_) {}
    }
    refreshMapAndWindows();
    bumpBattleStat("killEnemies", { count, finish });
    return { count, finish, inBattle: isInBattle() };
  }

  function escapeBattle() {
    const manager = battleManagerObject();
    if (!manager || !isInBattle()) return { attempted: false, escaped: false, reason: "not in battle" };
    let escaped = false;
    try {
      if (typeof manager.processEscape === "function") {
        const previousRatio = manager._escapeRatio;
        manager._escapeRatio = 1;
        const result = manager.processEscape();
        escaped = result !== false;
        if (previousRatio != null) manager._escapeRatio = previousRatio;
      }
      if (!escaped && typeof manager.processAbort === "function") {
        manager.processAbort();
        escaped = true;
      }
      if (!escaped && typeof manager.endBattle === "function") {
        manager.endBattle(1);
        escaped = true;
      }
      bumpBattleStat("escape", { escaped });
      refreshMapAndWindows();
      return { attempted: true, escaped };
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      throw error;
    }
  }

  function readGameValue(object, name, fallbackName) {
    const value = object && object[name];
    if (typeof value === "function") return value.call(object);
    if (value != null) return value;
    return object && object[fallbackName];
  }

  function resolveActor(actorId) {
    const id = Math.floor(requireNumber(actorId, "actorId"));
    const actors = resolveActors();
    if (actors && typeof actors.actor === "function") {
      const actor = actors.actor(id);
      if (actor) return actor;
    }
    const party = resolveParty();
    const members = getPartyMembers(party);
    return members.find(actor => actorIdOf(actor) === id) || null;
  }

  function requireActor(actorId) {
    const actor = resolveActor(actorId);
    if (!actor) throw new Error(`actor ${actorId} is unavailable`);
    return actor;
  }

  function refreshActor(actor) {
    try {
      if (actor && typeof actor.refresh === "function") actor.refresh();
    } catch (_) {}
  }

  function equipmentKind(item) {
    if (!item || typeof item !== "object") return "";
    if (item.wtypeId != null) return "weapon";
    if (item.atypeId != null) return "armor";
    const id = Number(item.id || 0);
    for (const kind of ["weapon", "armor"]) {
      const table = resolveData(kind);
      if (Array.isArray(table) && table[id] === item) return kind;
    }
    return "";
  }

  function equipmentTable(kind) {
    const table = resolveData(kind);
    return Array.isArray(table) ? table : [];
  }

  function refreshMapAndWindows() {
    try {
      const player = resolvePlayer();
      if (player && typeof player.refresh === "function") player.refresh();
      const sceneManager = resolveSceneManager();
      const scene = sceneManager && sceneManager._scene;
      if (scene && scene._statusWindow && typeof scene._statusWindow.refresh === "function") scene._statusWindow.refresh();
      if (scene && scene._itemWindow && typeof scene._itemWindow.refresh === "function") scene._itemWindow.refresh();
      if (scene && scene._skillWindow && typeof scene._skillWindow.refresh === "function") scene._skillWindow.refresh();
    } catch (_) {}
  }

  function setTrainerOptions(options) {
    if (!options || typeof options !== "object") return { ...bridge.options };
    const previousNoCost = bridge.options.noSkillCost;
    if (Object.prototype.hasOwnProperty.call(options, "expRate")) bridge.options.expRate = clampNumber(options.expRate, 0, 999, bridge.options.expRate);
    if (Object.prototype.hasOwnProperty.call(options, "goldRate")) bridge.options.goldRate = clampNumber(options.goldRate, 0, 999, bridge.options.goldRate);
    if (Object.prototype.hasOwnProperty.call(options, "dropRate")) bridge.options.dropRate = clampNumber(options.dropRate, 0, 999, bridge.options.dropRate);
    if (Object.prototype.hasOwnProperty.call(options, "noSkillCost")) bridge.options.noSkillCost = toBool(options.noSkillCost);
    if (Object.prototype.hasOwnProperty.call(options, "oneHitKill")) bridge.options.oneHitKill = toBool(options.oneHitKill);
    if (Object.prototype.hasOwnProperty.call(options, "invincible")) bridge.options.invincible = toBool(options.invincible);
    if (previousNoCost !== bridge.options.noSkillCost) {
      resetNoCostBaselines();
      if (bridge.options.noSkillCost) preserveNoCostResources("enabled");
    }
    ensureTrainerHooks();
    return { ...bridge.options };
  }

  function installInGameOverlay() {
    try {
      if (!document || document.getElementById("codex-trainer-overlay")) return false;
      const style = document.createElement("style");
      style.id = "codex-trainer-overlay-style";
      style.textContent = `
        #codex-trainer-overlay {
          position: fixed;
          right: 10px;
          top: 10px;
          z-index: 2147483647;
          width: 214px;
          padding: 8px;
          background: rgba(18, 20, 24, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 6px;
          color: #fff;
          font: 12px/1.35 Arial, "Microsoft YaHei", sans-serif;
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
          pointer-events: auto;
          user-select: none;
        }
        #codex-trainer-overlay button {
          height: 26px;
          margin: 2px;
          padding: 0 7px;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 4px;
          background: rgba(255,255,255,0.1);
          color: #fff;
          font: inherit;
          cursor: pointer;
        }
        #codex-trainer-overlay button.active { background: #1f8f5f; border-color: #4ad18f; }
        #codex-trainer-overlay .codex-row { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-top: 4px; }
        #codex-trainer-overlay .codex-title { display: flex; align-items: center; justify-content: space-between; font-weight: 700; margin-bottom: 4px; }
        #codex-trainer-overlay .codex-title button { width: 26px; padding: 0; }
        #codex-trainer-overlay.codex-collapsed { width: auto; padding: 4px; }
        #codex-trainer-overlay.codex-collapsed .codex-body { display: none; }
      `;
      document.documentElement.appendChild(style);

      const root = document.createElement("div");
      root.id = "codex-trainer-overlay";
      root.innerHTML = `
        <div class="codex-title"><span>修改器</span><button data-action="collapse">-</button></div>
        <div class="codex-body">
          <div class="codex-row"><span>经验</span><span data-rate="expRate"></span></div>
          <div class="codex-row"><span>积分</span><span data-rate="goldRate"></span></div>
          <div class="codex-row"><span>掉落</span><span data-rate="dropRate"></span></div>
          <div class="codex-row"><button data-toggle="noSkillCost">无耗</button><button data-toggle="oneHitKill">秒杀</button><button data-toggle="invincible">无敌</button></div>
        </div>
      `;
      document.documentElement.appendChild(root);
      if (bridgeConfig.overlayStartCollapsed !== false) {
        root.classList.add("codex-collapsed");
        const collapseButton = root.querySelector('[data-action="collapse"]');
        if (collapseButton) collapseButton.textContent = "+";
      }

      const rateValues = [1, 2, 5, 10];
      function cycleRate(name) {
        const current = Number(bridge.options[name] || 1);
        const index = rateValues.indexOf(current);
        const next = rateValues[(index + 1 + rateValues.length) % rateValues.length];
        setTrainerOptions({ [name]: next });
        writeState();
        render();
      }
      function render() {
        for (const name of ["expRate", "goldRate", "dropRate"]) {
          const host = root.querySelector(`[data-rate="${name}"]`);
          if (!host) continue;
          host.innerHTML = "";
          const button = document.createElement("button");
          button.textContent = `x${bridge.options[name]}`;
          button.setAttribute("data-cycle", name);
          host.appendChild(button);
        }
        for (const name of ["noSkillCost", "oneHitKill", "invincible"]) {
          const button = root.querySelector(`[data-toggle="${name}"]`);
          if (button) button.classList.toggle("active", !!bridge.options[name]);
        }
      }

      root.addEventListener("click", function (event) {
        const target = event.target;
        if (!target || typeof target.getAttribute !== "function") return;
        const cycle = target.getAttribute("data-cycle");
        const toggle = target.getAttribute("data-toggle");
        const action = target.getAttribute("data-action");
        if (cycle) cycleRate(cycle);
        if (toggle) {
          setTrainerOptions({ [toggle]: !bridge.options[toggle] });
          writeState();
          render();
        }
        if (action === "collapse") {
          root.classList.toggle("codex-collapsed");
          target.textContent = root.classList.contains("codex-collapsed") ? "+" : "-";
        }
        event.preventDefault();
        event.stopPropagation();
      }, true);

      document.addEventListener("keydown", function (event) {
        if (event.key === "F8") {
          root.style.display = root.style.display === "none" ? "" : "none";
          event.preventDefault();
          event.stopPropagation();
        }
      }, true);

      render();
      bridge.overlayInstalled = true;
      log("in-game overlay installed");
      return true;
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("in-game overlay failed", { error: bridge.lastError });
      return false;
    }
  }

  function patchMethod(owner, name, key, wrapper) {
    if (!owner || typeof owner[name] !== "function") return false;
    if (owner[name].__codexTrainerPatched) return true;
    if (!bridge.originals[key]) bridge.originals[key] = owner[name];
    const original = bridge.originals[key];
    const patched = function () {
      return wrapper.call(this, original, arguments);
    };
    Object.defineProperty(patched, "__codexTrainerPatched", { value: true, configurable: true });
    owner[name] = patched;
    return true;
  }

  function patchTrainerHooks() {
    let count = 0;
    const hooked = [];
    const enemyProtos = resolvePrototypeTargets("Game_Enemy", ["Game_Enemy", "GameEnemy"]);
    enemyProtos.forEach((target) => {
      if (patchMethod(target.object, "dropItemRate", `${target.label}.dropItemRate`, function (original, args) {
        const base = Number(original.apply(this, args) || 0);
        const value = Math.max(0, base * bridge.options.dropRate);
        bumpRateStat("dropItemRate", { base, value, rate: bridge.options.dropRate });
        return value;
      })) {
        count += 1;
        hooked.push(`${target.label}.dropItemRate`);
      }
      if (patchMethod(target.object, "makeDropItems", `${target.label}.makeDropItems`, function (original, args) {
        const result = original.apply(this, args);
        if (!Array.isArray(result) || bridge.options.dropRate <= 1) return result;
        const enemy = typeof this.enemy === "function" ? this.enemy() : null;
        const drops = enemy && Array.isArray(enemy.dropItems) ? enemy.dropItems : [];
        const tables = [null, resolveData("item"), resolveData("weapon"), resolveData("armor")];
        const existing = new Set(result.filter(Boolean).map((item) => `${item.id}:${item.name}`));
        drops.forEach((drop) => {
          if (!drop || !drop.kind || !drop.dataId) return;
          const table = tables[drop.kind];
          const item = table && table[drop.dataId];
          if (!item) return;
          const key = `${item.id}:${item.name}`;
          const denominator = Math.max(1, Number(drop.denominator || 1));
          const chance = Math.min(1, bridge.options.dropRate / denominator);
          if (!existing.has(key) && Math.random() < chance) {
            result.push(item);
            existing.add(key);
          }
        });
        bumpRateStat("makeDropItems", { count: result.length, rate: bridge.options.dropRate });
        return result;
      })) {
        count += 1;
        hooked.push(`${target.label}.makeDropItems`);
      }
    });

    const applyRewards = function (manager) {
      const rewards = manager && manager._rewards;
      if (!rewards) return false;
      if (!rewards.__codexBaseRewards) {
        const baseRewards = {
          exp: Number(rewards.exp || 0),
          gold: Number(rewards.gold || 0)
        };
        try {
          Object.defineProperty(rewards, "__codexBaseRewards", {
            value: baseRewards,
            configurable: true
          });
        } catch (_) {
          rewards.__codexBaseRewards = baseRewards;
        }
      }
      rewards.exp = Math.max(0, Math.floor(rewards.__codexBaseRewards.exp * bridge.options.expRate));
      rewards.gold = Math.max(0, Math.floor(rewards.__codexBaseRewards.gold * bridge.options.goldRate));
      bumpRateStat("battleRewards", {
        exp: rewards.exp,
        gold: rewards.gold,
        expRate: bridge.options.expRate,
        goldRate: bridge.options.goldRate
      });
      return true;
    };
    resolveBattleManagers().forEach((target) => {
      if (patchMethod(target.object, "makeRewards", `${target.label}.makeRewards`, function (original, args) {
        const result = original.apply(this, args);
        applyRewards(this);
        return result;
      })) {
        count += 1;
        hooked.push(`${target.label}.makeRewards`);
      }
      if (patchMethod(target.object, "gainRewards", `${target.label}.gainRewards`, function (original, args) {
        const scaled = applyRewards(this);
        return scaled
          ? withRatesSuppressed(() => original.apply(this, args))
          : withRateContext(() => original.apply(this, args));
      })) {
        count += 1;
        hooked.push(`${target.label}.gainRewards`);
      }
      if (patchMethod(target.object, "gainExp", `${target.label}.gainExp`, function (original, args) {
        const scaled = applyRewards(this);
        return scaled
          ? withRatesSuppressed(() => original.apply(this, args))
          : withRateContext(() => original.apply(this, args));
      })) {
        count += 1;
        hooked.push(`${target.label}.gainExp`);
      }
      if (patchMethod(target.object, "gainGold", `${target.label}.gainGold`, function (original, args) {
        const scaled = applyRewards(this);
        return scaled
          ? withRatesSuppressed(() => original.apply(this, args))
          : withRateContext(() => original.apply(this, args));
      })) {
        count += 1;
        hooked.push(`${target.label}.gainGold`);
      }
    });

    uniqueTargets(resolvePrototypeTargets("Game_Actor", ["Game_Actor", "GameActor"]).concat(
      partyMemberPrototypeTargets("runtime.party")
    )).forEach((target) => {
      if (patchMethod(target.object, "gainExp", `${target.label}.gainExp`, function (original, args) {
        if (bridge.suppressRates > 0 || bridge.options.expRate === 1 || !isInBattleRewardContext()) {
          return original.apply(this, args);
        }
        const next = Array.prototype.slice.call(args);
        const originalAmount = Number(next[0] || 0);
        next[0] = scaledPositiveAmount(next[0], bridge.options.expRate);
        bumpRateStat("actorGainExp", { base: originalAmount, value: next[0], rate: bridge.options.expRate });
        return original.apply(this, next);
      })) {
        count += 1;
        hooked.push(`${target.label}.gainExp`);
      }
    });

    resolvePrototypeTargets("Game_Party", ["Game_Party", "GameParty"]).forEach((target) => {
      if (patchMethod(target.object, "gainGold", `${target.label}.gainGold`, function (original, args) {
        if (bridge.suppressRates > 0 || bridge.options.goldRate === 1 || !isInBattleRewardContext()) {
          return original.apply(this, args);
        }
        const next = Array.prototype.slice.call(args);
        const originalAmount = Number(next[0] || 0);
        next[0] = scaledPositiveAmount(next[0], bridge.options.goldRate);
        bumpRateStat("partyGainGold", { base: originalAmount, value: next[0], rate: bridge.options.goldRate });
        return original.apply(this, next);
      })) {
        count += 1;
        hooked.push(`${target.label}.gainGold`);
      }
    });

    resolvePrototypeTargets("Game_Action", ["Game_Action", "GameAction"]).forEach((target) => {
      if (patchMethod(target.object, "apply", `${target.label}.apply`, function (original, args) {
        const subject = typeof this.subject === "function" ? this.subject() : null;
        const targetBattler = args && args[0];
        const hpSnapshot = bridge.options.invincible && isActorBattler(targetBattler) ? battlerHp(targetBattler) : null;
        const result = withNoCostPreserved(subject, `${target.label}.apply`, () => original.apply(this, args));
        if (hpSnapshot != null) restoreInvincibleHp(targetBattler, hpSnapshot, `${target.label}.apply`);
        if (bridge.options.oneHitKill && isActorBattler(subject) && isEnemyBattler(targetBattler)) {
          defeatEnemy(targetBattler, `${target.label}.apply`);
        }
        return result;
      })) {
        count += 1;
        hooked.push(`${target.label}.apply`);
      }
      if (patchMethod(target.object, "executeHpDamage", `${target.label}.executeHpDamage`, function (original, args) {
        const targetBattler = args && args[0];
        const value = Number(args && args[1] || 0);
        if (bridge.options.invincible && isActorBattler(targetBattler) && value > 0) {
          const next = Array.prototype.slice.call(args);
          next[1] = 0;
          bumpBattleStat("invincibleDamage", { source: target.label, value });
          return original.apply(this, next);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.executeHpDamage`);
      }
    });

    uniqueTargets(resolvePrototypeTargets("Game_Battler", ["Game_Battler", "GameBattler"]).concat(
      partyMemberPrototypeTargets("runtime.party")
    )).forEach((target) => {
      if (patchMethod(target.object, "setHp", `${target.label}.setHp`, function (original, args) {
        if (shouldBlockHpDecrease(this, args[0])) {
          const current = battlerHp(this);
          bumpBattleStat("invincibleBlockHp", { source: target.label, value: args[0], current });
          return original.call(this, current);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.setHp`);
      }
      if (patchMethod(target.object, "useItem", `${target.label}.useItem`, function (original, args) {
        return withNoCostPreserved(this, `${target.label}.useItem`, () => original.apply(this, args));
      })) {
        count += 1;
        hooked.push(`${target.label}.useItem`);
      }
      if (patchMethod(target.object, "setMp", `${target.label}.setMp`, function (original, args) {
        if (shouldBlockResourceDecrease(this, args[0], "mp")) {
          bumpBattleStat("noSkillCostBlockMp", { source: target.label, value: args[0] });
          return original.call(this, this.mp == null ? this._mp : this.mp);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.setMp`);
      }
      if (patchMethod(target.object, "setTp", `${target.label}.setTp`, function (original, args) {
        if (shouldBlockResourceDecrease(this, args[0], "tp")) {
          bumpBattleStat("noSkillCostBlockTp", { source: target.label, value: args[0] });
          return original.call(this, this.tp == null ? this._tp : this.tp);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.setTp`);
      }
    });

    uniqueTargets(resolvePrototypeTargets("Game_BattlerBase", ["Game_BattlerBase", "GameBattlerBase"]).concat(
      partyMemberPrototypeTargets("runtime.party")
    )).forEach((target) => {
      if (patchMethod(target.object, "setHp", `${target.label}.setHp`, function (original, args) {
        if (shouldBlockHpDecrease(this, args[0])) {
          const current = battlerHp(this);
          bumpBattleStat("invincibleBaseBlockHp", { source: target.label, value: args[0], current });
          return original.call(this, current);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.setHp`);
      }
      if (patchMethod(target.object, "canPaySkillCost", `${target.label}.canPaySkillCost`, function (original, args) {
        if (bridge.options.noSkillCost && isActorBattler(this)) {
          bumpBattleStat("noSkillCostCanPay", { source: target.label });
          return true;
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.canPaySkillCost`);
      }
      if (patchMethod(target.object, "paySkillCost", `${target.label}.paySkillCost`, function (original, args) {
        if (bridge.options.noSkillCost && isActorBattler(this)) {
          bumpBattleStat("noSkillCostPay", { source: target.label });
          return;
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.paySkillCost`);
      }
      if (patchMethod(target.object, "skillMpCost", `${target.label}.skillMpCost`, function (original, args) {
        if (bridge.options.noSkillCost && isActorBattler(this)) {
          bumpBattleStat("noSkillCostMp", { source: target.label });
          return 0;
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.skillMpCost`);
      }
      if (patchMethod(target.object, "skillTpCost", `${target.label}.skillTpCost`, function (original, args) {
        if (bridge.options.noSkillCost && isActorBattler(this)) {
          bumpBattleStat("noSkillCostTp", { source: target.label });
          return 0;
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.skillTpCost`);
      }
      if (patchMethod(target.object, "setMp", `${target.label}.setMp`, function (original, args) {
        if (shouldBlockResourceDecrease(this, args[0], "mp")) {
          bumpBattleStat("noSkillCostBaseBlockMp", { source: target.label, value: args[0] });
          return original.call(this, this.mp == null ? this._mp : this.mp);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.setMp`);
      }
      if (patchMethod(target.object, "setTp", `${target.label}.setTp`, function (original, args) {
        if (shouldBlockResourceDecrease(this, args[0], "tp")) {
          bumpBattleStat("noSkillCostBaseBlockTp", { source: target.label, value: args[0] });
          return original.call(this, this.tp == null ? this._tp : this.tp);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.setTp`);
      }
    });

    uniqueTargets(resolvePrototypeTargets("Game_Actor", ["Game_Actor", "GameActor"]).concat(
      partyMemberPrototypeTargets("runtime.party")
    )).forEach((target) => {
      if (patchMethod(target.object, "setHp", `${target.label}.setHp`, function (original, args) {
        if (shouldBlockHpDecrease(this, args[0])) {
          const current = battlerHp(this);
          bumpBattleStat("invincibleActorBlockHp", { source: target.label, value: args[0], current });
          return original.call(this, current);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.setHp`);
      }
      if (patchMethod(target.object, "skillMpCost", `${target.label}.skillMpCost`, function (original, args) {
        if (bridge.options.noSkillCost && isActorBattler(this)) {
          bumpBattleStat("noSkillCostActorMp", { source: target.label });
          return 0;
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.skillMpCost`);
      }
      if (patchMethod(target.object, "skillTpCost", `${target.label}.skillTpCost`, function (original, args) {
        if (bridge.options.noSkillCost && isActorBattler(this)) {
          bumpBattleStat("noSkillCostActorTp", { source: target.label });
          return 0;
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.skillTpCost`);
      }
      if (patchMethod(target.object, "paySkillCost", `${target.label}.paySkillCost`, function (original, args) {
        if (bridge.options.noSkillCost && isActorBattler(this)) {
          bumpBattleStat("noSkillCostActorPay", { source: target.label });
          return;
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.paySkillCost`);
      }
      if (patchMethod(target.object, "setMp", `${target.label}.setMp`, function (original, args) {
        if (shouldBlockResourceDecrease(this, args[0], "mp")) {
          bumpBattleStat("noSkillCostActorBlockMp", { source: target.label, value: args[0] });
          return original.call(this, this.mp == null ? this._mp : this.mp);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.setMp`);
      }
      if (patchMethod(target.object, "setTp", `${target.label}.setTp`, function (original, args) {
        if (shouldBlockResourceDecrease(this, args[0], "tp")) {
          bumpBattleStat("noSkillCostActorBlockTp", { source: target.label, value: args[0] });
          return original.call(this, this.tp == null ? this._tp : this.tp);
        }
        return original.apply(this, args);
      })) {
        count += 1;
        hooked.push(`${target.label}.setTp`);
      }
    });

    bridge.hooksPatched = count > 0;
    bridge.hookTargets = Array.from(new Set(hooked));
    return { patched: bridge.hooksPatched, count };
  }

  function trainerHooksWanted() {
    if (bridgeConfig.trainerHooks === false) return false;
    const options = bridge.options;
    return (
      Number(options.expRate || 1) !== 1 ||
      Number(options.goldRate || 1) !== 1 ||
      Number(options.dropRate || 1) !== 1 ||
      !!options.noSkillCost ||
      !!options.oneHitKill ||
      !!options.invincible
    );
  }

  function ensureTrainerHooks() {
    if (!trainerHooksWanted()) {
      return { patched: bridge.hooksPatched, count: bridge.hookTargets.length, skipped: true };
    }
    return patchTrainerHooks();
  }

  function variableValue(id) {
    try {
      const variables = resolveVariables();
      return variables && typeof variables.value === "function" ? variables.value(id) : null;
    } catch (_) {
      return null;
    }
  }

  function switchValue(id) {
    try {
      const switches = resolveSwitches();
      return switches && typeof switches.value === "function" ? switches.value(id) : null;
    } catch (_) {
      return null;
    }
  }

  function prisonNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.floor(number) : 0;
  }

  function prisonBagCount(bagName, id) {
    const party = resolveParty();
    try {
      if (party && party[bagName] && typeof party[bagName] === "object") {
        return prisonNumber(party[bagName][String(id)] || party[bagName][id]);
      }
      if (party && typeof party.numItems === "function") {
        const kind = bagName === "_armors" ? "armor" : bagName === "_weapons" ? "weapon" : "item";
        const table = resolveData(kind);
        const item = table && table[id];
        return item ? prisonNumber(party.numItems(item)) : 0;
      }
    } catch (_) {}
    return 0;
  }

  function prisonGuardValue(guard) {
    if (guard.kind === "gold") return prisonNumber(safeGold(resolveParty()));
    if (guard.kind === "variable") return prisonNumber(variableValue(guard.itemId));
    return prisonBagCount(guard.bagName, guard.itemId);
  }

  function prisonGuardPath(guard) {
    if (guard.kind === "gold") return "party._gold";
    if (guard.kind === "variable") return `variables._data.@a[${guard.itemId}]`;
    return `party.${guard.bagName}.${guard.itemId}`;
  }

  function prisonPartyActorIds() {
    const party = resolveParty();
    try {
      if (party && Array.isArray(party._actors)) {
        return party._actors.filter(id => Number.isFinite(Number(id))).map(id => Math.floor(Number(id)));
      }
    } catch (_) {}
    return getPartyMembers(party)
      .map(actorIdOf)
      .filter(id => Number.isFinite(Number(id)))
      .map(id => Math.floor(Number(id)));
  }

  function prisonCheck(id, group, label, pathText, value, limit, effect, severity, fixable, note) {
    const check = { id, group, label, path: pathText, value: String(value), limit, effect, severity, fixable };
    if (note) check.note = note;
    return check;
  }

  function actorParamPrisonCheck() {
    let rawValue = null;
    try {
      const actor = resolveActor(2);
      if (actor && typeof actor.param === "function") rawValue = actor.param(9);
    } catch (_) {}
    if (rawValue == null) {
      return prisonCheck(
        "actor-2-param-9",
        "运行时提示",
        "无名感知运行时判定",
        "CommonEvent 344: actor(2).param(9)",
        "无法读取",
        "< 19996",
        "CE344：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
        "warning",
        false,
        "该值依赖游戏运行时公式、装备和插件效果；GUI 会在 bridge 可读取时确认。"
      );
    }
    const value = prisonNumber(rawValue);
    const hit = value >= 19996;
    return prisonCheck(
      "actor-2-param-9",
      "运行时判定",
      "无名感知运行时判定",
      "CommonEvent 344: actor(2).param(9)",
      value,
      "< 19996",
      "CE344：提示终身监禁，Switch520 ON，禁用存档，传送 Map695",
      hit ? "danger" : "ok",
      false,
      hit ? "运行时已命中该阈值；需要手动检查装备、状态或插件参数来源。" : ""
    );
  }

  function collectPrisonGuardReport() {
    const checks = [];
    const punishmentSwitch = switchValue(520) === true;
    checks.push(prisonCheck(
      "switch-520",
      "惩处状态",
      "破坏规则惩处开关",
      "switches._data.@a[520]",
      punishmentSwitch ? "true" : "false",
      "false",
      "Map008 Event 1 Page 20 会因该开关切换事件页；部分判定会先打开此开关。",
      punishmentSwitch ? "danger" : "ok",
      punishmentSwitch
    ));

    PRISON_NUMERIC_GUARDS.forEach((guard) => {
      const value = prisonGuardValue(guard);
      const hit = value >= guard.limit;
      checks.push(prisonCheck(
        guard.id,
        guard.group,
        guard.label,
        prisonGuardPath(guard),
        value,
        `< ${guard.limit}`,
        guard.effect,
        hit ? "danger" : "ok",
        hit
      ));
    });

    const actorIds = prisonPartyActorIds();
    PRISON_MISSING_ITEM_GUARDS.forEach((guard) => {
      const actorInParty = actorIds.includes(guard.actorId);
      const itemCount = prisonBagCount("_items", guard.itemId);
      const hit = actorInParty && itemCount <= 0;
      checks.push(prisonCheck(
        guard.id,
        guard.group,
        guard.label,
        `CE${guard.commonEventId}: party has actor ${guard.actorName} #${guard.actorId}, requires item ${guard.itemName} #${guard.itemId}`,
        actorInParty ? `actor in party, item=${itemCount}` : "actor not in party",
        "actor absent or item >= 1",
        guard.effect,
        hit ? "danger" : "ok",
        hit,
        hit ? "修复会补 1 个要求物品，不会移除角色。" : ""
      ));
    });

    checks.push(actorParamPrisonCheck());
    const mapInfo = currentMapInfo();
    return {
      checks,
      hits: checks.filter(check => check.severity === "danger"),
      warnings: checks.filter(check => check.severity === "warning"),
      punishmentSwitch,
      mapId: mapInfo.mapId,
      playerX: mapInfo.x,
      playerY: mapInfo.y
    };
  }

  function prisonSetGold(value) {
    const party = resolveParty();
    if (!party) return false;
    const current = safeGold(party) || 0;
    try {
      if (typeof party.gainGold === "function") withRatesSuppressed(() => party.gainGold(value - current));
      else party._gold = value;
      return true;
    } catch (_) {
      return false;
    }
  }

  function prisonSetBagCount(kind, bagName, id, value) {
    const party = resolveParty();
    if (!party) return false;
    try {
      const current = prisonBagCount(bagName, id);
      const table = resolveData(kind);
      const item = table && table[id];
      if (item && typeof party.gainItem === "function") {
        party.gainItem(item, value - current);
        return true;
      }
      if (party[bagName] && typeof party[bagName] === "object") {
        if (value <= 0) delete party[bagName][String(id)];
        else party[bagName][String(id)] = value;
        return true;
      }
    } catch (_) {}
    return false;
  }

  function repairPrisonGuardRisks() {
    const before = collectPrisonGuardReport();
    const fixed = [];
    const pushFixed = (id) => {
      const check = before.checks.find(item => item.id === id);
      if (check) fixed.push(check);
    };

    PRISON_NUMERIC_GUARDS.forEach((guard) => {
      if (prisonGuardValue(guard) < guard.limit) return;
      let ok = false;
      if (guard.kind === "gold") ok = prisonSetGold(guard.safeValue);
      else if (guard.kind === "variable") ok = setVariableValue(guard.itemId, guard.safeValue) === guard.safeValue;
      else ok = prisonSetBagCount(guard.kind, guard.bagName, guard.itemId, guard.safeValue);
      if (ok) pushFixed(guard.id);
    });

    PRISON_MISSING_ITEM_GUARDS.forEach((guard) => {
      if (!prisonPartyActorIds().includes(guard.actorId) || prisonBagCount("_items", guard.itemId) > 0) return;
      if (prisonSetBagCount("item", "_items", guard.itemId, 1)) pushFixed(guard.id);
    });

    if (switchValue(520) === true) {
      try {
        setSwitchValue(520, false);
        pushFixed("switch-520");
      } catch (error) {
        bridge.lastError = String(error && error.stack || error);
      }
    }

    refreshMapAndWindows();
    return { beforeHits: before.hits.length, fixed, fixedCount: fixed.length, report: collectPrisonGuardReport() };
  }

  function setVariableValue(id, value) {
    const variables = resolveVariables();
    if (!variables || typeof variables.setValue !== "function") throw new Error("game variables are unavailable");
    variables.setValue(id, value);
    return value;
  }

  function setSwitchValue(id, value) {
    const switches = resolveSwitches();
    if (!switches || typeof switches.setValue !== "function") throw new Error("game switches are unavailable");
    switches.setValue(id, !!value);
    return !!value;
  }

  function saveGameToSlot(savefileId) {
    const dataManager = resolveDataManager();
    if (!dataManager || typeof dataManager.saveGame !== "function") throw new Error("saveGame is unavailable");
    const id = Math.floor(requireNumber(savefileId || 1, "id"));
    const result = dataManager.saveGame(id);
    return { id, result: String(result) };
  }

  function recoverPartyMembers() {
    const party = resolveParty();
    const members = getPartyMembers(party);
    members.forEach(actor => {
      if (actor && typeof actor.recoverAll === "function") actor.recoverAll();
      else {
        if (actor && typeof actor.setHp === "function" && actor.mhp != null) actor.setHp(actor.mhp);
        if (actor && typeof actor.setMp === "function" && actor.mmp != null) actor.setMp(actor.mmp);
        if (actor && typeof actor.setTp === "function") actor.setTp(100);
      }
      refreshActor(actor);
    });
    refreshMapAndWindows();
    return { count: members.length };
  }

  function collectState() {
    const party = resolveParty();
    const variables = resolveVariables();
    const switches = resolveSwitches();
    const dataManager = resolveDataManager();
    ensureTrainerHooks();
    if (bridge.options.noSkillCost) preserveNoCostResources("state");
    const mapInfo = currentMapInfo();
    return {
      ts: Date.now(),
      href: location.href,
      title: document.title,
      bridgeVersion: bridge.version,
      hasNode: true,
      cwd: process.cwd(),
      saveDir,
      saveDirExists: fs.existsSync(saveDir),
      saveFiles: (() => {
        try {
          return fs.existsSync(saveDir) ? fs.readdirSync(saveDir).filter(name => /\.rpgsave$/i.test(name)).sort() : [];
        } catch (_) {
          return [];
        }
      })(),
      storagePatched: !!(
        window.StorageManager && window.StorageManager.__codexSavePathPatched ||
        window.TK && window.TK.$ && window.TK.$.StorageMrg && window.TK.$.StorageMrg.__codexSavePathPatched
      ),
      hasTK: !!window.TK,
      hasParty: !!party,
      gold: safeGold(party),
      hasVariables: !!variables,
      hasSwitches: !!switches,
      hasDataManager: !!dataManager,
      currentMap: mapInfo,
      partyMembers: getPartyMembers(party).map(actorInfo).filter(Boolean),
      prisonGuardReport: collectPrisonGuardReport(),
      trainerOptions: { ...bridge.options },
      rateStats: { ...bridge.rateStats },
      battleStats: { ...bridge.battleStats },
      hookTargets: bridge.hookTargets.slice(),
      hooksPatched: bridge.hooksPatched,
      lastError: bridge.lastError
    };
  }

  function writeState() {
    ensureDir();
    fs.writeFileSync(statePath, JSON.stringify(collectState(), null, 2), "utf8");
  }

  function looseNumber(value) {
    if (typeof value === "number") return value;
    const text = String(value == null ? "" : value).trim();
    if (text === "") return NaN;
    const direct = Number(text);
    if (Number.isFinite(direct)) return direct;
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function requireNumber(value, name) {
    const number = looseNumber(value);
    if (!Number.isFinite(number)) throw new Error(`${name} must be a number, got ${JSON.stringify(value)}`);
    return number;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function commandQueueId(command, line) {
    if (!command || typeof command !== "object") return "";
    if (command.__codexQueueId) return String(command.__codexQueueId);
    if (command.commandId || command._commandId || command.cid) {
      return String(command.commandId || command._commandId || command.cid);
    }
    if (typeof command.id === "string" && /^\d+-[a-f0-9]+$/i.test(command.id)) return command.id;
    return `legacy-${hashString(line || JSON.stringify(command))}`;
  }

  function runtimeType(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }

  function runtimePreview(value, maxLength) {
    const limit = maxLength || 180;
    try {
      if (typeof value === "function") {
        return String(value).replace(/\s+/g, " ").slice(0, limit);
      }
      if (typeof value === "string") return value.slice(0, limit);
      if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
      if (Array.isArray(value)) return `[array length=${value.length}]`;
      const ctor = value && value.constructor && value.constructor.name;
      return `[object ${ctor || "Object"}]`;
    } catch (error) {
      return `[preview failed: ${String(error && error.message || error)}]`;
    }
  }

  function safeOwnPropertyNames(object) {
    try {
      if (!object || (typeof object !== "object" && typeof object !== "function")) return [];
      return Object.getOwnPropertyNames(object);
    } catch (_) {
      return [];
    }
  }

  function applyRuntimePathSuffix(value, suffix) {
    const normalized = String(suffix || "")
      .replace(/\[(\d+)\]/g, ".$1")
      .replace(/^\./, "");
    if (!normalized) return value;
    const parts = normalized.split(".").filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      if (value == null) return undefined;
      value = value[parts[index]];
    }
    return value;
  }

  function readRuntimePath(pathText) {
    const raw = String(pathText || "window").trim();
    if (!raw || raw === "window") return { path: "window", value: window };
    const aliasPath = raw.match(/^alias:([A-Za-z_$][\w$]*)(.*)$/);
    if (aliasPath) {
      return { path: raw, value: applyRuntimePathSuffix(callAlias(aliasPath[1]), aliasPath[2]) };
    }
    const aliasCall = raw.match(/^(?:window\.)?TK\.\$\.([A-Za-z_$][\w$]*)\(\)(.*)$/);
    if (aliasCall) return { path: raw, value: applyRuntimePathSuffix(callAlias(aliasCall[1]), aliasCall[2]) };
    const parts = raw.split(".").filter(Boolean);
    let value = window;
    let start = 0;
    if (parts[0] === "window") start = 1;
    for (let index = start; index < parts.length; index += 1) {
      if (value == null) return { path: raw, value: undefined };
      value = value[parts[index]];
    }
    return { path: raw, value };
  }

  function runtimeInspect(command) {
    const maxKeys = Math.max(1, Math.min(1000, Math.floor(Number(command.maxKeys || 240))));
    const maxPreview = Math.max(40, Math.min(1000, Math.floor(Number(command.maxPreview || 220))));
    const { path: pathText, value } = readRuntimePath(command.path || "window");
    const rows = [];
    const pushKey = (owner, key, source) => {
      if (rows.length >= maxKeys) return;
      let item;
      try {
        item = owner[key];
      } catch (error) {
        rows.push({ key, source, error: String(error && error.message || error) });
        return;
      }
      rows.push({
        key,
        source,
        type: runtimeType(item),
        arity: typeof item === "function" ? item.length : undefined,
        preview: runtimePreview(item, maxPreview)
      });
    };

    safeOwnPropertyNames(value).sort().forEach(key => pushKey(value, key, "own"));
    if (command.prototype !== false && value && (typeof value === "object" || typeof value === "function")) {
      let proto = Object.getPrototypeOf(value);
      let depth = 0;
      while (proto && proto !== Object.prototype && rows.length < maxKeys && depth < 3) {
        safeOwnPropertyNames(proto).sort().forEach(key => {
          if (key !== "constructor") pushKey(proto, key, `proto${depth + 1}`);
        });
        proto = Object.getPrototypeOf(proto);
        depth += 1;
      }
    }

    return {
      path: pathText,
      type: runtimeType(value),
      preview: runtimePreview(value, maxPreview),
      keyCount: rows.length,
      keys: rows
    };
  }

  function runtimeSearch(command) {
    const defaultKeywords = ["gold", "actor", "item", "weapon", "armor", "skill", "variable", "switch"];
    const keywords = (Array.isArray(command.keywords) && command.keywords.length ? command.keywords : defaultKeywords)
      .map(value => String(value || "").toLowerCase())
      .filter(Boolean);
    const maxResults = Math.max(1, Math.min(1000, Math.floor(Number(command.maxResults || 300))));
    const maxPreview = Math.max(40, Math.min(1000, Math.floor(Number(command.maxPreview || 220))));
    const maxDepth = Math.max(0, Math.min(5, Math.floor(Number(command.maxDepth || 2))));
    const roots = [
      ["window", window],
      ["window.TK", window.TK],
      ["window.TK.$", window.TK && window.TK.$],
      ["TK.$.gameSystem()", callAlias("gameSystem")],
      ["TK.$.gameParty()", callAlias("gameParty")],
      ["TK.$.gameVariables()", callAlias("gameVariables")],
      ["TK.$.gameSwitches()", callAlias("gameSwitches")],
      ["TK.$.gameMap()", callAlias("gameMap")],
      ["TK.$.gamePlayer()", callAlias("gamePlayer")],
      ["TK.$.gameTemp()", callAlias("gameTemp")],
      ["TK.$.dataSystem()", callAlias("dataSystem")],
      ["TK.$.dataItems()", callAlias("dataItems")],
      ["TK.$.dataSkills()", callAlias("dataSkills")],
      ["TK.$.dataCommonEvents()", callAlias("dataCommonEvents")],
      ["window.$gameSystem", window.$gameSystem],
      ["window.$gameParty", window.$gameParty],
      ["window.$gameVariables", window.$gameVariables],
      ["window.$gameSwitches", window.$gameSwitches],
      ["window.$gameMap", window.$gameMap],
      ["window.$gamePlayer", window.$gamePlayer],
      ["window.$gameTemp", window.$gameTemp],
      ["window.SceneManager", window.SceneManager],
      ["window.DataManager", window.DataManager],
      ["window.Game_Interpreter.prototype", window.Game_Interpreter && window.Game_Interpreter.prototype],
      ["window.Game_System.prototype", window.Game_System && window.Game_System.prototype],
      ["window.Game_Party.prototype", window.Game_Party && window.Game_Party.prototype],
      ["window.Game_Actor.prototype", window.Game_Actor && window.Game_Actor.prototype],
      ["window.Game_Battler.prototype", window.Game_Battler && window.Game_Battler.prototype],
      ["window.Game_Action.prototype", window.Game_Action && window.Game_Action.prototype],
      ["window.Window_Base.prototype", window.Window_Base && window.Window_Base.prototype]
    ].filter(item => item[1]);
    const visited = [];
    const results = [];

    const matches = (text) => {
      const haystack = String(text == null ? "" : text).toLowerCase();
      return keywords.some(keyword => haystack.includes(keyword));
    };
    const shouldDescend = (pathText, key, value, depth) => {
      if (depth >= maxDepth) return false;
      if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
      if (visited.includes(value)) return false;
      if (/^(document|localStorage|sessionStorage|indexedDB|chrome|nw|process|require|module|exports|global|console|performance)$/i.test(String(key))) return false;
      if (matches(pathText) || matches(key)) return true;
      return depth === 0 && /^(window\.TK|window\.TK\.\$|window\.\$game|window\.Game_|window\.SceneManager|window\.DataManager)/.test(pathText);
    };

    const addResult = (pathText, key, value, source) => {
      if (results.length >= maxResults) return;
      let preview = runtimePreview(value, maxPreview);
      if (!matches(pathText) && !matches(key) && !matches(preview)) return;
      results.push({
        path: pathText,
        key,
        source,
        type: runtimeType(value),
        arity: typeof value === "function" ? value.length : undefined,
        preview
      });
    };

    const visit = (pathText, object, depth) => {
      if (!object || (typeof object !== "object" && typeof object !== "function")) return;
      if (visited.includes(object) || results.length >= maxResults) return;
      visited.push(object);
      for (const key of safeOwnPropertyNames(object).sort()) {
        if (results.length >= maxResults) break;
        let value;
        try {
          value = object[key];
        } catch (_) {
          continue;
        }
        const childPath = `${pathText}.${key}`;
        addResult(childPath, key, value, "own");
        if (shouldDescend(childPath, key, value, depth)) visit(childPath, value, depth + 1);
      }

      const proto = Object.getPrototypeOf(object);
      if (proto && proto !== Object.prototype && depth < maxDepth && !visited.includes(proto)) {
        for (const key of safeOwnPropertyNames(proto).sort()) {
          if (results.length >= maxResults) break;
          if (key === "constructor") continue;
          let value;
          try {
            value = proto[key];
          } catch (_) {
            continue;
          }
          addResult(`${pathText}::${key}`, key, value, "prototype");
        }
      }
    };

    roots.forEach(([pathText, object]) => visit(pathText, object, 0));
    return {
      keywords,
      rootCount: roots.length,
      visitedCount: visited.length,
      resultCount: results.length,
      truncated: results.length >= maxResults,
      results
    };
  }

  function jsonSafeReplacer() {
    const seen = [];
    return function (key, value) {
      if (typeof value === "function") return undefined;
      if (value && typeof value === "object") {
        if (seen.includes(value)) return "[Circular]";
        seen.push(value);
      }
      return value;
    };
  }

  function dataDumpTargets(command) {
    const defaults = [
      "Actors", "Classes", "Skills", "Items", "Weapons", "Armors",
      "Enemies", "Troops", "States", "Animations", "Tilesets",
      "CommonEvents", "System", "MapInfos", "Map"
    ];
    const requested = Array.isArray(command.names)
      ? command.names
      : String(command.names || command.name || "")
        .split(/[,，\s]+/)
        .filter(Boolean);
    return requested.length ? requested : defaults;
  }

  function cleanDataDumpTargetName(name) {
    const cleanName = String(name || "").replace(/\.json$/i, "");
    if (!cleanName) return "";
    if (path.basename(cleanName) !== cleanName || !/^[A-Za-z][A-Za-z0-9_]*$/.test(cleanName)) {
      throw new Error(`invalid data.dump target name: ${String(name || "")}`);
    }
    return cleanName;
  }

  function runtimeDataDump(command) {
    const aliases = {
      Actors: "dataActors",
      Classes: "dataClasses",
      Skills: "dataSkills",
      Items: "dataItems",
      Weapons: "dataWeapons",
      Armors: "dataArmors",
      Enemies: "dataEnemies",
      Troops: "dataTroops",
      States: "dataStates",
      Animations: "dataAnimations",
      Tilesets: "dataTilesets",
      CommonEvents: "dataCommonEvents",
      System: "dataSystem",
      MapInfos: "dataMapInfos",
      Map: "dataMap"
    };
    const globals = {
      Actors: "$dataActors",
      Classes: "$dataClasses",
      Skills: "$dataSkills",
      Items: "$dataItems",
      Weapons: "$dataWeapons",
      Armors: "$dataArmors",
      Enemies: "$dataEnemies",
      Troops: "$dataTroops",
      States: "$dataStates",
      Animations: "$dataAnimations",
      Tilesets: "$dataTilesets",
      CommonEvents: "$dataCommonEvents",
      System: "$dataSystem",
      MapInfos: "$dataMapInfos",
      Map: "$dataMap"
    };
    const outputDir = resolveDataDumpOutputDir(command.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });
    const results = [];

    for (const name of dataDumpTargets(command)) {
      const cleanName = cleanDataDumpTargetName(name);
      if (!cleanName) continue;
      const globalName = globals[cleanName] || `$data${cleanName}`;
      const aliasName = aliases[cleanName] || `data${cleanName}`;
      const value = window[globalName] || callAlias(aliasName);
      if (value == null) {
        results.push({ name: cleanName, available: false, globalName, aliasName });
        continue;
      }
      const outputPath = path.join(outputDir, `${cleanName}.json`);
      fs.writeFileSync(outputPath, `${JSON.stringify(value, jsonSafeReplacer(), 2)}\n`, "utf8");
      results.push({
        name: cleanName,
        available: true,
        output: outputPath,
        bytes: fs.statSync(outputPath).size,
        count: Array.isArray(value) ? value.length : (value && typeof value === "object" ? Object.keys(value).length : undefined)
      });
    }

    return { outputDir, count: results.filter(item => item.available).length, results };
  }

  function resolveIconExportOutputDir(value) {
    const outputDir = value
      ? path.resolve(projectRoot, String(value))
      : path.join(projectRoot, "app", "gui", "icons");
    const allowedRoots = [
      path.join(projectRoot, "app", "gui", "icons"),
      path.join(projectRoot, "output")
    ];
    if (!allowedRoots.some((root) => isInsidePath(outputDir, root))) {
      throw new Error("asset.iconSet.export outputDir must be inside app/gui/icons or nwr_modkit/output");
    }
    return outputDir;
  }

  function bitmapImageSource(bitmap) {
    const candidates = [
      bitmap && bitmap._image,
      bitmap && bitmap.image,
      bitmap && bitmap._canvas,
      bitmap && bitmap.canvas
    ];
    return candidates.find((source) => source && Number(source.width || 0) >= 32 && Number(source.height || 0) >= 32) || null;
  }

  function canvasPngBuffer(canvas) {
    const dataUrl = canvas.toDataURL("image/png");
    const marker = "base64,";
    const index = dataUrl.indexOf(marker);
    if (index < 0) throw new Error("IconSet canvas did not produce a PNG data URL");
    const bufferCtor = window.Buffer || nodeBuffer && nodeBuffer.Buffer;
    if (!bufferCtor || typeof bufferCtor.from !== "function") throw new Error("Node Buffer is unavailable");
    return bufferCtor.from(dataUrl.slice(index + marker.length), "base64");
  }

  function writeIconSetBitmap(command, bitmap) {
    const source = bitmapImageSource(bitmap);
    if (!source) throw new Error("IconSet image source is unavailable");
    const width = Math.floor(Number(source.width || bitmap.width || 0));
    const height = Math.floor(Number(source.height || bitmap.height || 0));
    if (width < 32 || height < 32) throw new Error("IconSet dimensions are unavailable");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("IconSet canvas context is unavailable");
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, width, height, 0, 0, width, height);

    const outputDir = resolveIconExportOutputDir(command.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });
    const output = path.join(outputDir, "IconSet.png");
    const bytes = canvasPngBuffer(canvas);
    fs.writeFileSync(output, bytes);
    return {
      output,
      bytes: bytes.length,
      width,
      height,
      iconCount: Math.floor(width / 32) * Math.floor(height / 32)
    };
  }

  function scheduleIconSetExport(command, bitmap) {
    if (bridge.iconSetExportScheduled) {
      return {
        scheduled: true,
        already: true,
        outputDir: resolveIconExportOutputDir(command.outputDir)
      };
    }
    bridge.iconSetExportScheduled = true;
    const queuedCommand = { ...command };
    let completed = false;
    let attempts = 0;
    let timer = null;
    const finish = function (ok, payload) {
      if (completed) return;
      completed = true;
      bridge.iconSetExportScheduled = false;
      if (timer != null) clearInterval(timer);
      if (ok) {
        event(queuedCommand, true, payload);
      } else {
        event(queuedCommand, false, payload);
      }
      writeState();
    };
    const runExport = function () {
      attempts += 1;
      try {
        if (typeof bitmap.isError === "function" && bitmap.isError()) {
          finish(false, { error: "IconSet bitmap failed to load" });
          return;
        }
        if ((typeof bitmap.isReady !== "function" || bitmap.isReady()) || bitmapImageSource(bitmap)) {
          finish(true, writeIconSetBitmap(queuedCommand, bitmap));
          return;
        }
        if (attempts >= 80) finish(false, { error: "IconSet bitmap was not ready after 20 seconds" });
      } catch (error) {
        bridge.lastError = String(error && error.stack || error);
        finish(false, { error: bridge.lastError });
      }
    };
    timer = setInterval(runExport, 250);
    if (typeof bitmap.addLoadListener === "function") {
      bitmap.addLoadListener(runExport);
    }
    runExport();
    return {
      scheduled: true,
      outputDir: resolveIconExportOutputDir(command.outputDir)
    };
  }

  function exportIconSet(command) {
    const imageManager = window.ImageManager;
    if (!imageManager || typeof imageManager.loadSystem !== "function") {
      throw new Error("ImageManager.loadSystem is unavailable");
    }
    const bitmap = imageManager.loadSystem("IconSet");
    if (!bitmap) throw new Error("IconSet bitmap is unavailable");
    if (typeof bitmap.isError === "function" && bitmap.isError()) throw new Error("IconSet bitmap failed to load");
    if (typeof bitmap.isReady === "function" && !bitmap.isReady()) return scheduleIconSetExport(command, bitmap);
    return writeIconSetBitmap(command, bitmap);
  }

  function execute(command) {
    if (!command || typeof command !== "object") throw new Error("invalid command");
    const type = String(command.type || "");
    if (type === "ping") {
      return collectState();
    }
    if (type === "runtime.inspect") {
      return runtimeInspect(command);
    }
    if (type === "runtime.search") {
      return runtimeSearch(command);
    }
    if (type === "data.dump") {
      return runtimeDataDump(command);
    }
    if (type === "asset.iconSet.export") {
      return exportIconSet(command);
    }
    if (type === "trainer.options.get") {
      return { options: { ...bridge.options }, hooks: ensureTrainerHooks() };
    }
    if (type === "trainer.hooks.info") {
      return {
        options: { ...bridge.options },
        hooks: ensureTrainerHooks(),
        hookTargets: bridge.hookTargets.slice(),
        rateStats: { ...bridge.rateStats },
        battleStats: { ...bridge.battleStats }
      };
    }
    if (type === "trainer.options.set") {
      return { options: setTrainerOptions(command.options || command) };
    }
    if (type === "map.current") {
      return currentMapInfo();
    }
    if (type === "map.transfer") {
      const player = resolvePlayer();
      if (!player) throw new Error("game player is unavailable");
      const mapId = Math.floor(requireNumber(command.mapId, "mapId"));
      const x = Math.floor(requireNumber(command.x, "x"));
      const y = Math.floor(requireNumber(command.y, "y"));
      const direction = command.direction === undefined || command.direction === ""
        ? 2
        : Math.floor(requireNumber(command.direction, "direction"));
      const fade = command.fade === undefined || command.fade === ""
        ? 0
        : Math.floor(requireNumber(command.fade, "fade"));
      if (typeof player.reserveTransfer === "function") {
        player.reserveTransfer(mapId, x, y, direction, fade);
      } else if (typeof player.locate === "function") {
        player.locate(x, y);
      } else {
        throw new Error("player transfer is unavailable");
      }
      refreshMapAndWindows();
      return { mapId, x, y, direction, fade };
    }
    if (type === "commonEvent.run") {
      const temp = resolveTemp();
      if (!temp || typeof temp.reserveCommonEvent !== "function") throw new Error("reserveCommonEvent is unavailable");
      const id = Math.floor(requireNumber(command.id, "id"));
      temp.reserveCommonEvent(id);
      const map = resolveMap();
      if (map && typeof map.requestRefresh === "function") map.requestRefresh();
      const events = resolveCommonEvents();
      const eventData = events && events[id];
      return { id, name: eventData && eventData.name || "" };
    }
    if (type === "gold.add") {
      const party = resolveParty();
      if (!party) throw new Error("game party is unavailable");
      const amount = requireNumber(command.amount, "amount");
      if (typeof party.gainGold === "function") withRatesSuppressed(() => party.gainGold(amount));
      else party._gold = Math.max(0, Number(party._gold || 0) + amount);
      return { gold: safeGold(party) };
    }
    if (type === "gold.set") {
      const party = resolveParty();
      if (!party) throw new Error("game party is unavailable");
      const value = Math.max(0, Math.floor(requireNumber(command.value, "value")));
      const current = safeGold(party) || 0;
      if (typeof party.gainGold === "function") withRatesSuppressed(() => party.gainGold(value - current));
      else party._gold = value;
      return { gold: safeGold(party) };
    }
    if (type === "variable.set") {
      const variables = resolveVariables();
      if (!variables || typeof variables.setValue !== "function") throw new Error("game variables are unavailable");
      variables.setValue(Math.floor(requireNumber(command.id, "id")), command.value);
      return { id: command.id, value: command.value };
    }
    if (type === "switch.set") {
      const switches = resolveSwitches();
      if (!switches || typeof switches.setValue !== "function") throw new Error("game switches are unavailable");
      switches.setValue(Math.floor(requireNumber(command.id, "id")), !!command.value);
      return { id: command.id, value: !!command.value };
    }
    if (type === "item.add") {
      const party = resolveParty();
      if (!party || typeof party.gainItem !== "function") throw new Error("party gainItem is unavailable");
      const kind = String(command.kind || "item");
      const data = resolveData(kind);
      if (!data) throw new Error(`${kind} data is unavailable`);
      const item = data[Math.floor(requireNumber(command.id, "id"))];
      if (!item) throw new Error(`${kind} ${command.id} not found`);
      party.gainItem(item, Math.floor(requireNumber(command.amount, "amount")));
      return { kind, id: command.id, amount: command.amount };
    }
    if (type === "battle.killEnemies") {
      return killBattleEnemies(command);
    }
    if (type === "battle.escape") {
      return escapeBattle();
    }
    if (type === "party.recover") {
      return recoverPartyMembers();
    }
    if (type === "prison.repair") {
      return repairPrisonGuardRisks();
    }
    if (type === "actor.add" || type === "actor.unlock") {
      const party = resolveParty();
      if (!party || typeof party.addActor !== "function") throw new Error("party addActor is unavailable");
      const id = Math.floor(requireNumber(command.id, "id"));
      party.addActor(id);
      refreshMapAndWindows();
      return { unlocked: true, actor: actorInfo(resolveActor(id)) };
    }
    if (type === "actor.remove") {
      const party = resolveParty();
      if (!party || typeof party.removeActor !== "function") throw new Error("party removeActor is unavailable");
      const id = Math.floor(requireNumber(command.id, "id"));
      party.removeActor(id);
      refreshMapAndWindows();
      return { id };
    }
    if (type === "actor.recover") {
      const actor = requireActor(command.id);
      if (typeof actor.recoverAll === "function") actor.recoverAll();
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor) };
    }
    if (type === "actor.level.set") {
      const actor = requireActor(command.id);
      const level = Math.max(1, Math.floor(requireNumber(command.level, "level")));
      if (typeof actor.changeLevel === "function") actor.changeLevel(level, false);
      else actor._level = level;
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor) };
    }
    if (type === "actor.exp.add") {
      const actor = requireActor(command.id);
      const amount = Math.floor(requireNumber(command.amount, "amount"));
      if (typeof actor.gainExp === "function") withRatesSuppressed(() => actor.gainExp(amount));
      else if (typeof actor.changeExp === "function" && typeof actor.currentExp === "function") actor.changeExp(actor.currentExp() + amount, false);
      else {
        actor._exp = actor._exp || {};
        const classId = actor._classId || 0;
        actor._exp[classId] = Number(actor._exp[classId] || 0) + amount;
      }
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor), amount };
    }
    if (type === "actor.vitals.set") {
      const actor = requireActor(command.id);
      if (command.hp !== undefined && command.hp !== "") {
        const hp = Math.floor(requireNumber(command.hp, "hp"));
        if (typeof actor.setHp === "function") actor.setHp(hp);
        else actor._hp = hp;
      }
      if (command.mp !== undefined && command.mp !== "") {
        const mp = Math.floor(requireNumber(command.mp, "mp"));
        if (typeof actor.setMp === "function") withNoCostSuppressed(() => actor.setMp(mp));
        else actor._mp = mp;
        resetNoCostBaselines();
      }
      if (command.tp !== undefined && command.tp !== "") {
        const tp = Math.floor(requireNumber(command.tp, "tp"));
        if (typeof actor.setTp === "function") withNoCostSuppressed(() => actor.setTp(tp));
        else actor._tp = tp;
        resetNoCostBaselines();
      }
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor) };
    }
    if (type === "actor.param.add") {
      const actor = requireActor(command.id);
      const paramId = Math.floor(requireNumber(command.paramId, "paramId"));
      const value = Math.floor(requireNumber(command.value, "value"));
      if (typeof actor.addParam === "function") actor.addParam(paramId, value);
      else {
        actor._paramPlus = actor._paramPlus || [0, 0, 0, 0, 0, 0, 0, 0];
        actor._paramPlus[paramId] = Number(actor._paramPlus[paramId] || 0) + value;
      }
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor), paramId, value };
    }
    if (type === "actor.jp.add") {
      const actor = requireActor(command.id);
      const classId = resolveActorClassId(actor, command.classId);
      const amount = Math.floor(requireNumber(command.amount, "amount"));
      const value = addActorJp(actor, classId, amount);
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor), classId, amount, value };
    }
    if (type === "actor.allocationPoints.add") {
      const actor = requireActor(command.id);
      const classId = resolveActorClassId(actor, command.classId);
      const amount = Math.floor(requireNumber(command.amount, "amount"));
      const allocation = addActorAllocationPoints(actor, classId, amount);
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor), classId, amount, allocation };
    }
    if (type === "actor.name.set") {
      const actor = requireActor(command.id);
      const name = String(command.name || "");
      if (typeof actor.setName === "function") actor.setName(name);
      else actor._name = name;
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor) };
    }
    if (type === "actor.skill.learn") {
      const actor = requireActor(command.id);
      const skillId = Math.floor(requireNumber(command.skillId, "skillId"));
      if (typeof actor.learnSkill !== "function") throw new Error("actor learnSkill is unavailable");
      actor.learnSkill(skillId);
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor), skillId };
    }
    if (type === "actor.skill.forget") {
      const actor = requireActor(command.id);
      const skillId = Math.floor(requireNumber(command.skillId, "skillId"));
      if (typeof actor.forgetSkill !== "function") throw new Error("actor forgetSkill is unavailable");
      actor.forgetSkill(skillId);
      refreshActor(actor);
      refreshMapAndWindows();
      return { actor: actorInfo(actor), skillId };
    }
    if (type === "save") {
      return saveGameToSlot(command.id || 1);
    }
    if (type === "title.refresh") {
      return { refreshed: refreshTitleContinueCommand() };
    }
    throw new Error(`unknown command type: ${type}`);
  }

  function pollCommands() {
    try {
      ensureDir();
      if (!fs.existsSync(commandPath)) return;
      const lines = fs.readFileSync(commandPath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.replace(/^\uFEFF/, "").trim())
        .filter(Boolean);
      for (const line of lines) {
        let command;
        try {
          command = JSON.parse(line);
        } catch (error) {
          log("bad command json", { line, error: String(error && error.stack || error) });
          continue;
        }
        const id = commandQueueId(command, line);
        command.__codexQueueId = id;
        if (!id || bridge.processed[id]) continue;
        if (Number(command.ts || 0) < bridge.startedAtMs) {
          bridge.processed[id] = true;
          continue;
        }
        bridge.processed[id] = true;
        try {
          const payload = execute(command);
          event(command, true, payload);
          writeState();
        } catch (error) {
          bridge.lastError = String(error && error.stack || error);
          event(command, false, { error: bridge.lastError });
          writeState();
        }
      }
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("poll failed", { error: bridge.lastError });
    }
  }

  let lastCommandPollAt = 0;
  let lastStateWriteAt = 0;
  let lastNoCostGuardAt = 0;

  function bridgeTick(source) {
    const now = Date.now();
    try {
      if (bridgeConfig.bridgeTickHooks !== false) {
        patchBridgeTickHooks();
      }
      if (now - lastCommandPollAt >= 250) {
        lastCommandPollAt = now;
        pollCommands();
      }
      if (now - lastNoCostGuardAt >= 100) {
        lastNoCostGuardAt = now;
        preserveNoCostResources(source || "tick");
      }
      if (now - lastStateWriteAt >= 1000) {
        lastStateWriteAt = now;
        writeState();
      }
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("bridge tick failed", { source, error: bridge.lastError });
    }
  }

  function patchBridgeTickHooks() {
    const sceneManager = resolveSceneManager();
    if (!sceneManager || sceneManager.__codexBridgeTickPatched) return false;
    let patched = false;
    ["updateMain", "update", "renderScene"].forEach((name) => {
      if (typeof sceneManager[name] !== "function") return;
      patched = patchMethod(sceneManager, name, `SceneManager.${name}.bridgeTick`, function (original, args) {
        const result = original.apply(this, args);
        bridgeTick(`SceneManager.${name}`);
        return result;
      }) || patched;
    });
    if (patched) {
      sceneManager.__codexBridgeTickPatched = true;
      log("patched bridge tick hooks", { sceneManager: true });
    }
    return patched;
  }

  function startBridgeSchedulers() {
    try {
      if (nodeTimers && typeof nodeTimers.setInterval === "function") {
        const nodeInterval = nodeTimers.setInterval(function () {
          bridgeTick("nodeInterval");
        }, 250);
        bridge.schedulers.push(nodeInterval);
        log("node timer scheduler started");
      }
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("node timer scheduler failed", { error: bridge.lastError });
    }

    try {
      const timeoutLoop = function () {
        bridgeTick("timeout");
        bridge.timeoutHandle = setTimeout(timeoutLoop, 250);
      };
      bridge.timeoutHandle = setTimeout(timeoutLoop, 250);
      bridge.schedulers.push({ type: "timeoutLoop" });
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("timeout scheduler failed", { error: bridge.lastError });
    }

    try {
      const browserInterval = setInterval(function () {
        bridgeTick("interval");
      }, 250);
      bridge.schedulers.push(browserInterval);
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("interval scheduler failed", { error: bridge.lastError });
    }

    try {
      if (typeof requestAnimationFrame === "function") {
        const rafLoop = function () {
          bridgeTick("raf");
          requestAnimationFrame(rafLoop);
        };
        requestAnimationFrame(rafLoop);
      }
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("raf scheduler failed", { error: bridge.lastError });
    }

    try {
      const commandWake = function () {
        pollCommands();
        writeState();
      };
      fs.mkdirSync(bridgeDir, { recursive: true });
      if (!fs.existsSync(commandPath)) fs.writeFileSync(commandPath, "", "utf8");
      const watcher = fs.watch(commandPath, { persistent: false }, commandWake);
      bridge.schedulers.push(watcher);
      fs.watchFile(commandPath, { interval: 250 }, commandWake);
      bridge.schedulers.push({ watchFile: commandPath });
      log("command file watcher started");
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("command file watcher failed", { error: bridge.lastError });
    }
  }

  function showGameWindow() {
    try {
      if (window.nw && nw.Window && nw.Window.get) {
        const win = nw.Window.get();
        if (win && typeof win.show === "function") win.show();
        if (win && typeof win.focus === "function") win.focus();
        return true;
      }
    } catch (error) {
      bridge.lastError = String(error && error.stack || error);
      log("show game window failed", { error: bridge.lastError });
    }
    return false;
  }

  ensureDir();
  log("bridge injected", { href: location.href, cwd: process.cwd() });
  if (bridgeConfig.showWindowOnInject === true) {
    showGameWindow();
  }
  if (bridgeConfig.overlay !== false) {
    installInGameOverlay();
  }
  if (bridgeConfig.dataDumpHooks !== false) {
    installEarlyDataHooks();
  }
  if (bridgeConfig.savePathPatch !== false) {
    patchSavePaths();
  }
  writeState();
  bridge.__tick = bridgeTick;
  bridge.__pollCommands = pollCommands;
  bridge.__writeState = writeState;
  if (bridgeConfig.savePathPatch !== false) {
    const patchTimer = setInterval(function () {
      if (patchSavePaths()) {
        if (!bridgeConfig.disableTitleRefresh) refreshTitleContinueCommand();
        clearInterval(patchTimer);
      }
    }, 100);
  }
  if (bridgeConfig.schedulers !== false) {
    startBridgeSchedulers();
  }
})();
