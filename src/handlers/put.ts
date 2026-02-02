import type { Context } from "hono";
import type { Env, VaultContext } from "../types";
import { VaultError } from "../types";
import { encrypt } from "../crypto";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

export async function handlePut(c: Context<HonoEnv>) {
  const vault = c.get("vault");
  const path = c.req.param("path");
  const key = `vaults/${vault.vaultId}/${path}`;

  const quotaBytes = parseInt(c.env.VAULT_QUOTA_MB || "50", 10) * 1024 * 1024;

  const contentLength = parseInt(c.req.header("Content-Length") || "0", 10);
  if (contentLength > quotaBytes) {
    throw new VaultError(413, "Upload exceeds vault quota");
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength > quotaBytes) {
    throw new VaultError(413, "Upload exceeds vault quota");
  }

  const contentType = c.req.header("Content-Type") || "application/octet-stream";

  const encrypted = await encrypt(vault.apiKey, body);
  const storedSize = encrypted.byteLength;
  const usageKey = `usage:${vault.vaultId}`;

  const [currentUsageStr, existing] = await Promise.all([
    c.env.API_KEYS.get(usageKey),
    c.env.VAULT_BUCKET.head(key),
  ]);

  const currentUsage = parseInt(currentUsageStr || "0", 10);
  const oldSize = existing?.size ?? 0;

  if (currentUsage + storedSize - oldSize > quotaBytes) {
    throw new VaultError(413, "Vault storage quota exceeded");
  }

  await c.env.VAULT_BUCKET.put(key, encrypted, {
    customMetadata: { contentType },
  });

  const updatedUsage = currentUsage + storedSize - oldSize;
  await c.env.API_KEYS.put(usageKey, String(updatedUsage));

  return c.json(
    { ok: true, path, size: body.byteLength, usage: updatedUsage, quota: quotaBytes },
    201,
  );
}
