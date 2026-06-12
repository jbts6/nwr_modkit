import crypto from "node:crypto";

export const DEFAULT_DATA_ALGORITHM = "aes-192-cbc";
export const DEFAULT_DATA_PASSWORD = "6f03e16e201226059d4aaa5e1950da4a";
export const DEFAULT_DATA_SALT = "2023/3/19";
export const DEFAULT_DATA_KEY_HEX = "eda0337069573a14c302c58324416304580b3a7e515133ab";
export const DEFAULT_DATA_IV_HEX = "01010101010101010101010101010101";

export function createDataCryptoOptions(options = {}) {
  const algorithm = options.algorithm || DEFAULT_DATA_ALGORITHM;
  const ivHex = options.ivHex || DEFAULT_DATA_IV_HEX;
  const key = options.keyHex
    ? Buffer.from(options.keyHex, "hex")
    : crypto.scryptSync(
      options.password || DEFAULT_DATA_PASSWORD,
      options.salt || DEFAULT_DATA_SALT,
      Number(options.keyLength || 24)
    );

  return {
    algorithm,
    key,
    iv: Buffer.from(ivHex, "hex"),
    keyHex: key.toString("hex"),
    ivHex
  };
}

export function looksLikeEncryptedDataText(text) {
  const body = String(text).trim();
  return body.length > 0 && body.length % 2 === 0 && /^[0-9a-f]+$/i.test(body);
}

export function decryptDataHex(hexText, options = {}) {
  const cryptoOptions = createDataCryptoOptions(options);
  const decipher = crypto.createDecipheriv(
    cryptoOptions.algorithm,
    cryptoOptions.key,
    cryptoOptions.iv
  );
  return decipher.update(String(hexText).trim(), "hex", "utf8") + decipher.final("utf8");
}

export function decryptDataObject(hexText, options = {}) {
  return JSON.parse(decryptDataHex(hexText, options));
}

export function parseDataFileText(text, options = {}) {
  const body = String(text).trim();
  if (body.startsWith("{") || body.startsWith("[")) {
    return JSON.parse(body);
  }
  if (!looksLikeEncryptedDataText(body)) {
    throw new Error("data file is neither JSON text nor encrypted hex text");
  }
  return decryptDataObject(body, options);
}

export function stringifyDataObject(value, options = {}) {
  if (options.pretty) return `${JSON.stringify(value, null, 2)}\n`;
  return JSON.stringify(value);
}

export function encryptDataText(plainText, options = {}) {
  const cryptoOptions = createDataCryptoOptions(options);
  const cipher = crypto.createCipheriv(
    cryptoOptions.algorithm,
    cryptoOptions.key,
    cryptoOptions.iv
  );
  return cipher.update(String(plainText), "utf8", "hex") + cipher.final("hex");
}

export function encryptDataObject(value, options = {}) {
  return encryptDataText(stringifyDataObject(value, options), options);
}
