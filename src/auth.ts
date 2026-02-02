import { createMiddleware } from "hono/factory";
import type { Env, ApiKeyMetadata, VaultContext } from "./types";
import { VaultError } from "./types";
import { hashApiKey } from "./crypto";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

export const auth = createMiddleware<HonoEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new VaultError(401, "Missing or malformed Authorization header");
  }

  const token = header.slice(7);
  const keyHash = await hashApiKey(token);
  const raw = await c.env.API_KEYS.get(`key:${keyHash}`);
  if (!raw) {
    throw new VaultError(401, "Invalid API key");
  }

  let meta: ApiKeyMetadata;
  try {
    meta = JSON.parse(raw);
  } catch {
    throw new VaultError(401, "Invalid API key");
  }
  if (!meta.vaultId || !meta.name) {
    throw new VaultError(401, "Invalid API key");
  }
  c.set("vault", { vaultId: meta.vaultId, keyName: meta.name, apiKey: token });
  await next();
});
