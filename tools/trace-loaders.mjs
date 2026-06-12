#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(process.argv[2] || path.join(import.meta.dirname, "..", ".."));
const projectRoot = path.resolve(import.meta.dirname, "..");
const outDir = path.join(projectRoot, "runtime", "loader-trace");
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { name: "bg-script", file: path.join(root, "loading"), html: false },
  { name: "www-loading", file: path.join(root, "www", "loading.html"), html: true },
  { name: "www-index", file: path.join(root, "www", "index.html"), html: true },
];

const events = [];

function log(kind, data = {}) {
  events.push({
    at: new Date().toISOString(),
    kind,
    ...data,
  });
}

function extractScripts(source) {
  const scripts = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(source))) scripts.push(match[1]);
  return scripts.length ? scripts : [source];
}

function makeContext(target) {
  let reloads = 0;
  const listeners = [];
  const windowObject = {
    on(event, handler) {
      log("nw.window.on", { target, event });
      listeners.push({ event, handler });
      if (event === "loaded") {
        try {
          handler();
        } catch (error) {
          log("nw.window.loaded.handler.error", { target, error: String(error && error.stack || error) });
        }
      }
    },
    evalNWBin(thisArg, file) {
      log("nw.window.evalNWBin", { target, thisArg: describeValue(thisArg), file: String(file) });
      return undefined;
    },
    show() {
      log("nw.window.show", { target });
    },
    hide() {
      log("nw.window.hide", { target });
    },
    close() {
      log("nw.window.close", { target });
    },
  };

  const fakeLocation = {
    href: `file:///${path.join(root, target).replace(/\\/g, "/")}`,
    reload() {
      reloads += 1;
      log("location.reload", { target, count: reloads });
      if (reloads > 5) throw new Error("reload loop stopped by tracer");
    },
  };

  const fakeDocument = {
    title: "",
    body: {},
    createElement(tag) {
      log("document.createElement", { target, tag });
      return {
        set src(value) {
          log("element.src.set", { target, tag, value: String(value) });
        },
        set type(value) {
          log("element.type.set", { target, tag, value: String(value) });
        },
        onload: null,
        onerror: null,
      };
    },
    getElementsByTagName(tag) {
      log("document.getElementsByTagName", { target, tag });
      return [{
        appendChild(node) {
          log("element.appendChild", { target, tag, node: describeValue(node) });
          if (node && typeof node.onload === "function") node.onload();
        },
      }];
    },
  };

  const sandbox = {
    console: {
      log: (...args) => log("console.log", { target, args: args.map(String) }),
      error: (...args) => log("console.error", { target, args: args.map(String) }),
      warn: (...args) => log("console.warn", { target, args: args.map(String) }),
    },
    require(id) {
      log("require", { target, id: String(id) });
      return requireShim(id);
    },
    process: {
      cwd: () => root,
      chdir: (dir) => log("process.chdir", { target, dir: String(dir) }),
      env: {},
      versions: { nw: "trace", node: process.versions.node },
      execPath: path.join(root, "Game.exe"),
      exit(code = 0) {
        log("process.exit", { target, code });
        throw new Error(`process.exit(${code}) stopped by tracer`);
      },
    },
    nw: {
      Window: {
        get() {
          log("nw.Window.get", { target });
          return windowObject;
        },
        open(url, options, callback) {
          log("nw.Window.open", { target, url: String(url), options });
          if (typeof callback === "function") callback(windowObject);
        },
      },
      App: {
        manifest: readJson(path.join(root, "package.json")),
        quit() {
          log("nw.App.quit", { target });
          throw new Error("nw.App.quit stopped by tracer");
        },
      },
    },
    window: null,
    globalThis: null,
    self: null,
    document: fakeDocument,
    location: fakeLocation,
    navigator: { userAgent: "trace", plugins: { namedItem: () => null } },
    setTimeout(fn, ms) {
      log("setTimeout", { target, ms });
      if (typeof fn === "function") fn();
      return 1;
    },
    setInterval(fn, ms) {
      log("setInterval", { target, ms });
      if (typeof fn === "function") fn();
      return 1;
    },
    clearTimeout() {},
    clearInterval() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return vm.createContext(sandbox, { name: target });
}

function requireShim(id) {
  if (id === "fs") return fs;
  if (id === "path") return path;
  if (id === "os") return awaitlessImportOs();
  throw new Error(`require not stubbed: ${id}`);
}

function awaitlessImportOs() {
  return {
    homedir: () => process.env.USERPROFILE || process.env.HOME || root,
    tmpdir: () => process.env.TEMP || process.env.TMP || root,
    platform: () => process.platform,
    arch: () => process.arch,
  };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function describeValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[array:${value.length}]`;
  return `[${typeof value}]`;
}

for (const target of targets) {
  if (!fs.existsSync(target.file)) {
    log("target.missing", { target: target.name, file: target.file });
    continue;
  }
  const text = fs.readFileSync(target.file, "utf8");
  const scripts = target.html ? extractScripts(text) : [text];
  scripts.forEach((script, index) => {
    const context = makeContext(`${target.name}#${index}`);
    try {
      vm.runInContext(script, context, {
        filename: target.file,
        timeout: 3000,
      });
      log("script.done", { target: target.name, index });
    } catch (error) {
      log("script.error", { target: target.name, index, error: String(error && error.stack || error) });
    }
  });
}

const outPath = path.join(outDir, "trace.json");
fs.writeFileSync(outPath, JSON.stringify(events, null, 2), "utf8");

for (const event of events) {
  if (event.kind === "nw.window.evalNWBin" || event.kind === "nw.Window.open" || event.kind === "location.reload" || event.kind === "script.error") {
    console.log(JSON.stringify(event));
  }
}
console.log(`trace written: ${outPath}`);
