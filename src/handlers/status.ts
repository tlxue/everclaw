import type { Context } from "hono";
import type { Env, VaultContext } from "../types";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

export async function handleStatus(c: Context<HonoEnv>) {
  const vault = c.get("vault");
  const prefix = `vaults/${vault.vaultId}/`;

  const quotaBytes = parseInt(c.env.VAULT_QUOTA_MB || "50", 10) * 1024 * 1024;
  const usageKey = `usage:${vault.vaultId}`;

  const currentUsageStr = await c.env.API_KEYS.get(usageKey);
  const usage = parseInt(currentUsageStr || "0", 10);

  let fileCount = 0;
  let lastSynced: string | null = null;
  let cursor: string | undefined;

  do {
    const listed = await c.env.VAULT_BUCKET.list({ prefix, cursor, limit: 1000 });
    fileCount += listed.objects.length;

    for (const obj of listed.objects) {
      const ts = obj.uploaded.toISOString();
      if (!lastSynced || ts > lastSynced) {
        lastSynced = ts;
      }
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return c.json({
    ok: true,
    vaultId: vault.vaultId,
    fileCount,
    usage,
    quota: quotaBytes,
    lastSynced,
  });
}
