import type { Context } from "hono";
import type { Env, VaultContext } from "../types";
import { VaultError } from "../types";
import { decrypt } from "../crypto";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

export async function handleGet(c: Context<HonoEnv>) {
  const vault = c.get("vault");
  const path = c.req.param("path");
  const key = `vaults/${vault.vaultId}/${path}`;

  const object = await c.env.VAULT_BUCKET.get(key);
  if (!object) {
    throw new VaultError(404, `Not found: ${path}`);
  }

  const encrypted = await object.arrayBuffer();
  let plaintext: ArrayBuffer;
  try {
    plaintext = await decrypt(vault.apiKey, encrypted);
  } catch {
    throw new VaultError(500, "Failed to decrypt file — data may be corrupted");
  }

  const contentType = object.customMetadata?.contentType || "application/octet-stream";

  return new Response(plaintext, {
    headers: { "Content-Type": contentType },
  });
}
