import type { Context } from "hono";
import type { Env, VaultContext } from "../types";
import { VaultError } from "../types";
import { encrypt } from "../crypto";

type HonoEnv = { Bindings: Env; Variables: { vault: VaultContext } };

interface BatchFile {
  path: string;
  content: string;
  contentType?: string;
}

interface BatchRequest {
  files?: BatchFile[];
}

interface BatchResult {
  path: string;
  ok: boolean;
  size?: number;
  error?: string;
}

const MAX_FILES = 20;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024; // 5MB

export async function handleBatch(c: Context<HonoEnv>) {
  const vault = c.get("vault");
  const quotaBytes = parseInt(c.env.VAULT_QUOTA_MB || "50", 10) * 1024 * 1024;

  const body: BatchRequest = await c.req.json<BatchRequest>().catch(() => ({}));

  if (!body.files || !Array.isArray(body.files)) {
    throw new VaultError(
      400,
      "Request must include a 'files' array",
      "VALIDATION_ERROR",
      "Send { files: [{ path, content, contentType? }] }",
    );
  }

  if (body.files.length === 0) {
    throw new VaultError(
      400,
      "Files array cannot be empty",
      "VALIDATION_ERROR",
      "Include at least one file in the files array",
    );
  }

  if (body.files.length > MAX_FILES) {
    throw new VaultError(
      400,
      `Batch limited to ${MAX_FILES} files`,
      "BATCH_LIMIT_EXCEEDED",
      `Split your upload into batches of ${MAX_FILES} files or fewer`,
    );
  }

  const files = body.files;

  // Validate all files and calculate total size
  let totalInputBytes = 0;
  for (const file of files) {
    if (!file.path || typeof file.path !== "string") {
      throw new VaultError(
        400,
        "Each file must have a 'path' string",
        "VALIDATION_ERROR",
        "Ensure all files have a valid path field",
      );
    }
    if (file.content === undefined || typeof file.content !== "string") {
      throw new VaultError(
        400,
        `File '${file.path}' must have a 'content' string`,
        "VALIDATION_ERROR",
        "Ensure all files have a valid content field",
      );
    }
    totalInputBytes += new TextEncoder().encode(file.content).length;
  }

  if (totalInputBytes > MAX_TOTAL_BYTES) {
    throw new VaultError(
      413,
      `Batch total exceeds ${MAX_TOTAL_BYTES / 1024 / 1024}MB limit`,
      "BATCH_LIMIT_EXCEEDED",
      "Split your upload into smaller batches",
    );
  }

  // Get current usage and existing file sizes
  const usageKey = `usage:${vault.vaultId}`;
  const [currentUsageStr, ...existingHeads] = await Promise.all([
    c.env.API_KEYS.get(usageKey),
    ...files.map((f: BatchFile) => c.env.VAULT_BUCKET.head(`vaults/${vault.vaultId}/${f.path}`)),
  ]);

  let currentUsage = parseInt(currentUsageStr || "0", 10);
  const results: BatchResult[] = [];
  let uploaded = 0;
  let failed = 0;

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const key = `vaults/${vault.vaultId}/${file.path}`;
    const contentType = file.contentType || "application/octet-stream";

    try {
      const contentBytes = new TextEncoder().encode(file.content);
      const encrypted = await encrypt(vault.apiKey, contentBytes.buffer as ArrayBuffer);
      const storedSize = encrypted.byteLength;
      const oldSize = existingHeads[i]?.size ?? 0;

      // Check quota
      if (currentUsage + storedSize - oldSize > quotaBytes) {
        results.push({
          path: file.path,
          ok: false,
          error: "Would exceed quota",
        });
        failed++;
        continue;
      }

      // Store the file
      await c.env.VAULT_BUCKET.put(key, encrypted, {
        customMetadata: { contentType },
      });

      currentUsage = currentUsage + storedSize - oldSize;
      results.push({
        path: file.path,
        ok: true,
        size: contentBytes.length,
      });
      uploaded++;
    } catch (err) {
      results.push({
        path: file.path,
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
      failed++;
    }
  }

  // Update usage tracking
  await c.env.API_KEYS.put(usageKey, String(currentUsage));

  return c.json({
    ok: failed === 0,
    results,
    uploaded,
    failed,
    usage: currentUsage,
    quota: quotaBytes,
  }, uploaded > 0 ? 201 : 400);
}
