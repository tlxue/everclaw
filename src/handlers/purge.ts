import type { Context } from "hono";
import type { Env, VaultContext } from "../types";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

export async function handlePurge(c: Context<HonoEnv>) {
  const vault = c.get("vault");
  const prefix = `vaults/${vault.vaultId}/`;

  let deleted = 0;
  let cursor: string | undefined;

  do {
    const listed = await c.env.VAULT_BUCKET.list({ prefix, cursor, limit: 1000 });
    const keys = listed.objects.map((obj) => obj.key);
    if (keys.length > 0) {
      await c.env.VAULT_BUCKET.delete(keys);
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  await c.env.API_KEYS.put(`usage:${vault.vaultId}`, "0");

  return c.json({ ok: true, deleted });
}
