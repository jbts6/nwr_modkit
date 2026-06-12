import LZString from "lz-string";
import pako from "pako";

export type SaveKind = "native-json";

export interface SaveTextParts {
  prefix: string;
  payload: string;
  suffix: string;
}

export interface DecodedSave {
  value: unknown;
  kind: SaveKind;
  parts: SaveTextParts;
  payloadLength: number;
  jsonLength: number;
}

function normalizeSaveText(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function extractSavePayload(raw: string): SaveTextParts {
  const payload = normalizeSaveText(raw);
  if (!payload) throw new Error("存档内容为空。");
  return { prefix: "", payload, suffix: "" };
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function decodeSaveText(raw: string): Promise<DecodedSave> {
  const parts = extractSavePayload(raw);
  const innerBase64 = LZString.decompressFromBase64(parts.payload);
  if (!innerBase64) {
    throw new Error("LZString 解压失败：这不像本游戏的原生 rpgsave。");
  }

  const jsonBytes = pako.inflate(base64ToBytes(innerBase64));
  const jsonText = new TextDecoder().decode(jsonBytes);
  return {
    value: JSON.parse(jsonText),
    kind: "native-json",
    parts,
    payloadLength: parts.payload.length,
    jsonLength: jsonText.length
  };
}

export async function encodeSaveText(value: unknown, parts?: SaveTextParts | null): Promise<string> {
  const jsonText = JSON.stringify(value);
  const compressed = pako.deflate(new TextEncoder().encode(jsonText), { level: 9 });
  const innerBase64 = bytesToBase64(compressed);
  const payload = LZString.compressToBase64(innerBase64);
  if (!parts) return payload;
  return `${parts.prefix}${payload}${parts.suffix}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function toJsonFriendly(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (Array.isArray(value)) return value.map((item) => toJsonFriendly(item));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) out[key] = toJsonFriendly(val);
    return out;
  }
  return value;
}

export function fromJsonFriendly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => fromJsonFriendly(item));

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "$bigint") {
      if (typeof value.$bigint !== "string") throw new Error("$bigint 必须是十进制字符串。");
      return BigInt(value.$bigint);
    }

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) out[key] = fromJsonFriendly(val);
    return out;
  }

  return value;
}
