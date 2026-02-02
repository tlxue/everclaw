import type { Context } from "hono";
import type { Env, VaultContext } from "../types";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

export async function handleList(c: Context<HonoEnv>) {
  const vault = c.get("vault");
  const prefix = `vaults/${vault.vaultId}/`;

  const cursor = c.req.query("cursor") || undefined;
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 100), 1000) : 100;

  const usageKey = `usage:${vault.vaultId}`;
  const quotaBytes = parseInt(c.env.VAULT_QUOTA_MB || "50", 10) * 1024 * 1024;

  const [listed, currentUsageStr] = await Promise.all([
    c.env.VAULT_BUCKET.list({ prefix, cursor, limit }),
    c.env.API_KEYS.get(usageKey),
  ]);

  const usage = parseInt(currentUsageStr || "0", 10);

  const objects = listed.objects.map((obj) => ({
    path: obj.key.slice(prefix.length),
    size: obj.size,
    uploaded: obj.uploaded.toISOString(),
  }));

  return c.json({
    ok: true,
    objects,
    truncated: listed.truncated,
    cursor: listed.truncated ? listed.cursor : undefined,
    usage,
    quota: quotaBytes,
  });
}
