import type { Context } from "hono";
import type { Env, VaultContext } from "../types";
import { hashApiKey } from "../crypto";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const segments = [4, 4, 4];
  return segments
    .map((len) =>
      Array.from(crypto.getRandomValues(new Uint8Array(len)))
        .map((b) => chars[b % chars.length])
        .join(""),
    )
    .join("-");
}

function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function handleProvision(c: Context<HonoEnv>) {
  const body = (await c.req.json<{ name?: string; apiKey?: string }>().catch(() => ({}))) as {
    name?: string;
    apiKey?: string;
  };
  const name = body.name || "default";
  const apiKey = body.apiKey || `ec-${generateKey()}`;

  const vaultId = `vault-${generateId()}`;

  const keyHash = await hashApiKey(apiKey);
  const metadata = JSON.stringify({ vaultId, name });
  await c.env.API_KEYS.put(`key:${keyHash}`, metadata);
  await c.env.API_KEYS.put(`usage:${vaultId}`, "0");

  return c.json({ ok: true, vaultId, apiKey }, 201);
}
