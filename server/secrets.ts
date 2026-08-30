import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { config } from "./config";

const key = () => {
  if (!config.SESSION_SECRET) throw new Error("SESSION_SECRET is required for credential encryption");
  return createHash("sha256").update(config.SESSION_SECRET).digest();
};

export function encryptSecret(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret<T>(encoded: string): T {
  const [version, ivText, tagText, cipherText] = encoded.split(".");
  if (version !== "v1" || !ivText || !tagText || !cipherText) throw new Error("Unsupported encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherText, "base64url")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

