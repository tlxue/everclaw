import type { Context } from "hono";
import type { Env, VaultContext } from "../types";
import { VaultError } from "../types";
import { encrypt, decrypt } from "../crypto";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

export async function handleAppend(c: Context<HonoEnv>) {
  const vault = c.get("vault");
  const path = c.req.param("path");
  const key = `vaults/${vault.vaultId}/${path}`;

  const quotaBytes = parseInt(c.env.VAULT_QUOTA_MB || "50", 10) * 1024 * 1024;

  const appendContent = await c.req.arrayBuffer();
  if (appendContent.byteLength === 0) {
    throw new VaultError(400, "Empty content", "VALIDATION_ERROR", "Provide content to append");
  }

  const contentType = c.req.header("Content-Type") || "application/octet-stream";
  const usageKey = `usage:${vault.vaultId}`;

  const [currentUsageStr, existing] = await Promise.all([
    c.env.API_KEYS.get(usageKey),
    c.env.VAULT_BUCKET.get(key),
  ]);

  const currentUsage = parseInt(currentUsageStr || "0", 10);
  const oldSize = existing?.size ?? 0;

  let newContent: ArrayBuffer;

  if (existing) {
    // Decrypt existing content and append
    const encrypted = await existing.arrayBuffer();
    let existingPlaintext: ArrayBuffer;
    try {
      existingPlaintext = await decrypt(vault.apiKey, encrypted);
    } catch {
      throw new VaultError(
        500,
        "Failed to decrypt existing file — data may be corrupted",
        "DECRYPT_FAILED",
        "Data corrupted or wrong API key",
      );
    }

    // Combine: existing + newline + new content
    const existingBytes = new Uint8Array(existingPlaintext);
    const appendBytes = new Uint8Array(appendContent);
    const newline = new TextEncoder().encode("\n");

    const combined = new Uint8Array(existingBytes.length + newline.length + appendBytes.length);
    combined.set(existingBytes, 0);
    combined.set(newline, existingBytes.length);
    combined.set(appendBytes, existingBytes.length + newline.length);
    newContent = combined.buffer;
  } else {
    // File doesn't exist, create with just the new content
    newContent = appendContent;
  }

  if (newContent.byteLength > quotaBytes) {
    throw new VaultError(
      413,
      "Result exceeds vault quota",
      "QUOTA_EXCEEDED",
      "Delete unused files with DELETE /v1/vault/{path}",
    );
  }

  const encrypted = await encrypt(vault.apiKey, newContent);
  const storedSize = encrypted.byteLength;

  if (currentUsage + storedSize - oldSize > quotaBytes) {
    throw new VaultError(
      413,
      "Vault storage quota exceeded",
      "QUOTA_EXCEEDED",
      "Delete unused files with DELETE /v1/vault/{path}",
    );
  }

  await c.env.VAULT_BUCKET.put(key, encrypted, {
    customMetadata: { contentType },
  });

  const updatedUsage = currentUsage + storedSize - oldSize;
  await c.env.API_KEYS.put(usageKey, String(updatedUsage));

  return c.json(
    { ok: true, path, size: newContent.byteLength, usage: updatedUsage, quota: quotaBytes },
    201,
  );
}
