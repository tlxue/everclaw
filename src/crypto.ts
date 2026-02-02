const HKDF_SALT = new TextEncoder().encode("everclaw-vault-v1");
const HKDF_INFO = new TextEncoder().encode("vault-encryption");

export async function hashApiKey(apiKey: string): Promise<string> {
  const data = new TextEncoder().encode(apiKey);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKey(apiKey: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiKey),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "HKDF", salt: HKDF_SALT, info: HKDF_INFO, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(apiKey: string, plaintext: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await deriveKey(apiKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  // Prepend IV (12 bytes) to ciphertext
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return result.buffer;
}

export async function decrypt(apiKey: string, data: ArrayBuffer): Promise<ArrayBuffer> {
  // AES-GCM minimum: 12-byte IV + 16-byte auth tag = 28 bytes
  if (data.byteLength < 28) {
    throw new Error("Encrypted data is corrupted or too short to decrypt");
  }
  const key = await deriveKey(apiKey);
  const bytes = new Uint8Array(data);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}
