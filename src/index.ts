import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, VaultContext } from "./types";
import { VaultError } from "./types";
import { auth } from "./auth";
import { handleGet } from "./handlers/get";
import { handlePut } from "./handlers/put";
import { handleList } from "./handlers/list";
import { handleDelete } from "./handlers/delete";
import { handlePurge } from "./handlers/purge";
import { handleStatus } from "./handlers/status";
import { handleProvision } from "./handlers/provision";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

const app = new Hono<HonoEnv>();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

// Rate limit provision: 5 requests per minute per IP, tracked in KV
app.post("/v1/provision", async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const rateLimitKey = `ratelimit:provision:${ip}`;
  const maxRequests = 5;
  const windowSeconds = 60;

  const raw = await c.env.API_KEYS.get(rateLimitKey);
  const count = parseInt(raw || "0", 10);

  if (count >= maxRequests) {
    throw new VaultError(429, "Too many requests. Try again later.");
  }

  await c.env.API_KEYS.put(rateLimitKey, String(count + 1), {
    expirationTtl: windowSeconds,
  });

  await next();
});
app.post("/v1/provision", handleProvision);

const vault = new Hono<HonoEnv>();
vault.use("*", auth);
vault.get("/", handleList);
vault.get("/status", handleStatus);
vault.delete("/", handlePurge);
vault.get("/:path{.+}", handleGet);
vault.put("/:path{.+}", handlePut);
vault.delete("/:path{.+}", handleDelete);

app.route("/v1/vault/", vault);
app.route("/v1/vault", vault);

app.notFound((c) => c.json({ ok: false, error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof VaultError) {
    return c.json({ ok: false, error: err.message }, err.status as any);
  }
  console.error(err);
  return c.json({ ok: false, error: "Internal server error" }, 500);
});

export default app;
