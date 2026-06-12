import fs from "node:fs";
import path from "node:path";
import { parseDataFileText } from "./data-codec.mjs";
import { resolveGameRoot, resolveProjectRootFromTool } from "./modkit-config.mjs";

const projectRoot = resolveProjectRootFromTool(import.meta.url);
const args = parseArgs(process.argv.slice(2));
const gameRoot = resolveGameRoot(projectRoot, args["game-root"] || "");
const extractedDataDir = path.join(projectRoot, "output", "extract", "data");
const encryptedDataDir = path.join(gameRoot, "www", "data");
const outputPath = path.resolve(
  projectRoot,
  args.output || path.join("app", "save-editor", "public", "game-data-index.json")
);

const system = readDataFile("System.json") || {};
const index = {
  generatedAt: new Date().toISOString(),
  source: fs.existsSync(extractedDataDir) ? "nwr_modkit/output/extract/data" : "www/data",
  gameTitle: cleanText(system.gameTitle || "Nightmare without return"),
  switches: namedEntries(system.switches || [], "开关"),
  variables: namedEntries(system.variables || [], "变量"),
  actors: catalogEntries("Actors.json", "actor"),
  items: catalogEntries("Items.json", "item"),
  weapons: catalogEntries("Weapons.json", "weapon"),
  armors: catalogEntries("Armors.json", "armor"),
  skills: catalogEntries("Skills.json", "skill"),
  classes: catalogEntries("Classes.json", "class"),
  maps: catalogEntries("MapInfos.json", "map")
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: outputPath,
  counts: {
    switches: index.switches.length,
    variables: index.variables.length,
    actors: index.actors.length,
    items: index.items.length,
    weapons: index.weapons.length,
    armors: index.armors.length,
    skills: index.skills.length,
    classes: index.classes.length,
    maps: index.maps.length
  }
}, null, 2));

function catalogEntries(fileName, kind) {
  const data = readDataFile(fileName);
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry) => entry && Number.isFinite(Number(entry.id)))
    .map((entry) => {
      const id = Number(entry.id);
      const name = cleanText(entry.name || "");
      const description = truncate(cleanText(entry.description || entry.profile || ""), 180);
      const note = truncate(cleanText(entry.note || ""), 120);
      const extra = [
        entry.classId ? `职业 ${entry.classId}` : "",
        entry.parentId ? `父级 ${entry.parentId}` : "",
        entry.order ? `序 ${entry.order}` : ""
      ].filter(Boolean).join(" / ");
      return {
        id,
        kind,
        name: name || `${kind} ${id}`,
        iconIndex: Number.isFinite(Number(entry.iconIndex)) ? Number(entry.iconIndex) : 0,
        description,
        note,
        extra,
        searchText: makeSearchText([id, kind, name, description, note, extra])
      };
    })
    .filter((entry) => entry.name)
    .sort((a, b) => a.id - b.id);
}

function namedEntries(names, fallbackPrefix) {
  if (!Array.isArray(names)) return [];
  return names
    .map((name, index) => {
      const text = cleanText(name || "");
      if (!text && index === 0) return null;
      return {
        id: index,
        name: text || `${fallbackPrefix} ${index}`,
        searchText: makeSearchText([index, text, fallbackPrefix])
      };
    })
    .filter(Boolean);
}

function readDataFile(fileName) {
  const extractedPath = path.join(extractedDataDir, fileName);
  if (fs.existsSync(extractedPath)) {
    return JSON.parse(fs.readFileSync(extractedPath, "utf8"));
  }
  const encryptedPath = path.join(encryptedDataDir, fileName);
  if (!fs.existsSync(encryptedPath)) return null;
  return parseDataFileText(fs.readFileSync(encryptedPath, "utf8"));
}

function cleanText(value) {
  return String(value || "")
    .replace(/\\[A-Za-z]+\[[^\]]*]/g, "")
    .replace(/\\[A-Za-z]+/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, max) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function makeSearchText(parts) {
  return parts
    .filter((part) => part != null && part !== "")
    .map((part) => String(part))
    .join(" ")
    .toLowerCase();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      parsed[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
