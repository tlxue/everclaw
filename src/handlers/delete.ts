import type { Context } from "hono";
import type { Env, VaultContext } from "../types";
import { VaultError } from "../types";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

export async function handleDelete(c: Context<HonoEnv>) {
  const vault = c.get("vault");
  const path = c.req.param("path");
  const key = `vaults/${vault.vaultId}/${path}`;

  const head = await c.env.VAULT_BUCKET.head(key);
  if (!head) {
    throw new VaultError(404, `Not found: ${path}`);
  }

  await c.env.VAULT_BUCKET.delete(key);

  const usageKey = `usage:${vault.vaultId}`;
  const currentUsageStr = await c.env.API_KEYS.get(usageKey);
  const currentUsage = parseInt(currentUsageStr || "0", 10);
  const updatedUsage = Math.max(0, currentUsage - head.size);
  await c.env.API_KEYS.put(usageKey, String(updatedUsage));

  return c.json({ ok: true, deleted: path });
}
