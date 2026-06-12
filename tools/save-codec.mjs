import zlib from "node:zlib";
import LZStringModule from "lz-string";

const LZString = LZStringModule.default || LZStringModule;

export function decodeSaveText(text) {
  const raw = String(text || "").trim();
  const innerBase64 = LZString.decompressFromBase64(raw);
  if (!innerBase64) {
    throw new Error("LZString decompression failed");
  }
  const jsonBytes = zlib.inflateSync(Buffer.from(innerBase64, "base64"));
  return JSON.parse(jsonBytes.toString("utf8"));
}

export function encodeSaveText(value) {
  const jsonText = JSON.stringify(value);
  const innerBase64 = zlib.deflateSync(Buffer.from(jsonText, "utf8")).toString("base64");
  return LZString.compressToBase64(innerBase64);
}

export function stableJson(value) {
  return JSON.stringify(value, (key, val) => typeof val === "bigint" ? val.toString() : val);
}
