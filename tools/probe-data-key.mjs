import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_DATA_ALGORITHM,
  DEFAULT_DATA_IV_HEX,
  DEFAULT_DATA_KEY_HEX,
  DEFAULT_DATA_PASSWORD,
  DEFAULT_DATA_SALT,
  createDataCryptoOptions,
  looksLikeEncryptedDataText,
  parseDataFileText
} from "./data-codec.mjs";
import { resolveGameRoot, resolveProjectRootFromTool } from "./modkit-config.mjs";

const projectRoot = resolveProjectRootFromTool(import.meta.url);
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const gameRoot = resolveGameRoot(projectRoot, args["game-root"] || "");
const dataDir = path.join(gameRoot, "www", "data");
const codecInput = {
  algorithm: args.algorithm || DEFAULT_DATA_ALGORITHM,
  password: args.password || DEFAULT_DATA_PASSWORD,
  salt: args.salt || DEFAULT_DATA_SALT,
  keyHex: args["key-hex"],
  ivHex: args["iv-hex"] || DEFAULT_DATA_IV_HEX,
  keyLength: args["key-length"] || 24
};
const cryptoOptions = createDataCryptoOptions(codecInput);
const decryptInput = {
  algorithm: cryptoOptions.algorithm,
  keyHex: cryptoOptions.keyHex,
  ivHex: cryptoOptions.ivHex
};
const sampleNames = getSampleNames(args.samples);
const samples = [];
let systemInfo = null;

for (const name of sampleNames) {
  const filePath = path.join(dataDir, name);
  if (!fs.existsSync(filePath)) {
    samples.push({ file: `www/data/${name}`, exists: false });
    continue;
  }

  const text = fs.readFileSync(filePath, "utf8");
  const parsed = parseDataFileText(text, decryptInput);
  const summary = summarizeParsedData(parsed);

  samples.push({
    file: `www/data/${name}`,
    exists: true,
    encryptedHex: looksLikeEncryptedDataText(text),
    textLength: text.length,
    ...summary
  });

  if (name.toLowerCase() === "system.json") {
    systemInfo = {
      gameTitle: parsed.gameTitle ?? null,
      versionId: parsed.versionId ?? null,
      hasEncryptedImages: parsed.hasEncryptedImages === true,
      hasEncryptedAudio: parsed.hasEncryptedAudio === true,
      assetEncryptionKey: parsed.encryptionKey ?? null
    };
  }
}

console.log(JSON.stringify({
  gameRoot,
  dataDirectory: dataDir,
  dataCrypto: {
    algorithm: cryptoOptions.algorithm,
    source: args["key-hex"] ? "explicit-key-hex" : "scrypt-password-salt",
    password: args["key-hex"] ? null : codecInput.password,
    salt: args["key-hex"] ? null : codecInput.salt,
    keyLength: args["key-hex"] ? cryptoOptions.key.length : Number(codecInput.keyLength),
    keyHex: cryptoOptions.keyHex,
    ivHex: cryptoOptions.ivHex,
    matchesKnownKey: cryptoOptions.keyHex === DEFAULT_DATA_KEY_HEX
  },
  system: systemInfo,
  samples
}, null, 2));

function getSampleNames(value) {
  if (!value) return ["System.json", "Actors.json", "MapInfos.json"];
  return String(value)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => name.toLowerCase().endsWith(".json") ? name : `${name}.json`);
}

function summarizeParsedData(value) {
  if (Array.isArray(value)) {
    return {
      parsedType: "array",
      entries: value.length
    };
  }

  if (value && typeof value === "object") {
    return {
      parsedType: "object",
      keys: Object.keys(value).length
    };
  }

  return {
    parsedType: typeof value
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      parsed[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node ./nwr_modkit/tools/probe-data-key.mjs --game-root .

Options:
  --game-root <path>      Game root containing www/index.html.
  --samples <list>        Comma-separated data files. Default: System.json,Actors.json,MapInfos.json.
  --password <text>       Password used with scrypt.
  --salt <text>           Salt used with scrypt.
  --key-hex <hex>         Use an explicit AES key instead of deriving one.
  --iv-hex <hex>          AES IV. Default: ${DEFAULT_DATA_IV_HEX}
  --algorithm <name>      Cipher algorithm. Default: ${DEFAULT_DATA_ALGORITHM}
`);
}
