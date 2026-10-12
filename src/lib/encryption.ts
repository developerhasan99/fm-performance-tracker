import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for secrets stored in the database (Shopify app secrets and tokens).
// ENCRYPTION_KEY: 32 random bytes, base64. Generate with `openssl rand -base64 32`.
function key() {
  const raw = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (raw.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  return raw;
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
}

export function decrypt(stored: string) {
  const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
