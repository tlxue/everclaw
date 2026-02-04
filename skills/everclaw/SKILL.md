---
name: everclaw
description: Encrypted cloud memory for your agent. Your API key is generated on your device and never stored on the server — only a SHA-256 hash. Everything your agent saves is AES-256-GCM encrypted at rest before storage. The server handles plaintext transiently during requests. One key, full recovery — switch devices, set up a fresh agent, enter your API key, and all your memory is back.
metadata:
  version: "0.3.3"
  openclaw:
    emoji: "🦞"
    primaryEnv: EVERCLAW_API_KEY
    user-invocable: true
---

# Everclaw Vault

Everclaw backs up your agent's memory and identity files to a remote vault so they survive across devices, reinstalls, and workspace resets.

Base URL: `https://everclaw.chong-eae.workers.dev`

## Setup

When the skill is invoked, run the full setup automatically without asking the user any questions. **Report progress to the user at each step.**

**If `EVERCLAW_API_KEY` is already set:** Skip to the health check (step 4 below), then proceed to sync. Everything is already configured.

**If `EVERCLAW_API_KEY` is not set:** Run all of the following steps automatically:

### Step 1: Security warning (BEFORE key generation)

Tell the user:

> **Important:** Your API key will be generated next. Save it immediately — it cannot be recovered if lost. Your data is encrypted with this key.

### Step 2: Generate key and provision vault

Report: "Creating vault..."

```bash
API_KEY="ec-$(openssl rand -hex 32)"
RESPONSE=$(curl -s -X POST "https://everclaw.chong-eae.workers.dev/v1/provision" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$(whoami)\",\"apiKey\":\"$API_KEY\"}")
```

Extract `vaultId` from the response. The response includes:
- `vaultId` — your vault identifier
- `apiKey` — your encryption key (same as generated)
- `quota` — storage limit in bytes
- `usage` — current usage (0 for new vaults)
- `securityReminder` — reminder to save the key

Report: "Vault created: {vaultId}"

### Step 3: Save configuration

Report: "Saving configuration..."

Read `~/.openclaw/openclaw.json` (create if missing), then set:
- `skills.entries.everclaw.enabled` → `true`
- `skills.entries.everclaw.env.EVERCLAW_API_KEY` → the generated `API_KEY`

Append the Everclaw sync task to `HEARTBEAT.md` in the workspace (create if missing). Add this block if it's not already present:

```
## Everclaw vault sync
- Back up modified files to Everclaw vault: SOUL.md, IDENTITY.md, USER.md, MEMORY.md, memory/*.md, TOOLS.md, HEARTBEAT.md
- Only push files that changed since last sync
```

Report: "Configuration saved"

### Step 4: Initial backup (batch upload)

Report: "Backing up files..."

Collect all existing standard files and upload them in a single batch request:

```bash
# Build JSON array of files that exist
FILES='{"files":['
# For each file that exists, add: {"path":"MEMORY.md","content":"...","contentType":"text/markdown"}
# Close array
FILES+=']}'

curl -s -X POST "https://everclaw.chong-eae.workers.dev/v1/vault/_batch" \
  -H "Authorization: Bearer $EVERCLAW_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$FILES"
```

The batch endpoint returns:
- `results` — array of `{path, ok, size?, error?}` for each file
- `uploaded` — count of successful uploads
- `failed` — count of failed uploads
- `usage` — current vault usage in bytes
- `quota` — vault quota in bytes

Report: "{uploaded}/{total} files backed up ({usage_kb} KB used)"

### Step 5: Verify and show summary

Confirm the vault is reachable:
```bash
curl -s "https://everclaw.chong-eae.workers.dev/health"
```

Display the final summary to the user:

```
✓ Vault ready: {vaultId}
✓ Files backed up: {count} ({usage_kb} KB / {quota_mb} MB)

⚠️  SAVE THIS API KEY — it cannot be recovered:
    {API_KEY}

Your memory will sync automatically. Run /everclaw anytime to check status.
```

## Files to sync

Sync these standard OpenClaw workspace files automatically. Do not invent new file types — follow the existing workspace conventions.

**Identity & soul (sync on change):**
- `SOUL.md` — persona, tone, values, boundaries
- `IDENTITY.md` — name, creature type, emoji, avatar
- `USER.md` — user profile, preferences, timezone

**Memory (sync on change and on heartbeat):**
- `MEMORY.md` — curated long-term memory
- `memory/*.md` — daily logs (`memory/2026-02-02.md` etc.)

**Workspace config (sync on change):**
- `TOOLS.md` — local environment notes
- `HEARTBEAT.md` — periodic task checklist

Do NOT sync: `AGENTS.md` (workspace-specific instructions), `BOOTSTRAP.md` (one-time use), `BOOT.md` (gateway-specific), credentials, or session transcripts.

## When to sync

**Backup (immediately after changes):**
After you update ANY synced file, push it to the vault IMMEDIATELY — do not wait for heartbeat.
This prevents data loss if the container resets before the next heartbeat.

**Restore (session start):**
On first message of a session, if any of the standard files above are missing locally, restore them from the vault:

```bash
# List what's in the vault
curl -s "https://everclaw.chong-eae.workers.dev/v1/vault/" \
  -H "Authorization: Bearer $EVERCLAW_API_KEY"

# Restore a file
curl -s "https://everclaw.chong-eae.workers.dev/v1/vault/MEMORY.md" \
  -H "Authorization: Bearer $EVERCLAW_API_KEY"
```

Only restore files that are missing locally. Do not overwrite local files that already exist — local is always the source of truth.

**Backup (after changes):**
After you update any of the synced files (write to MEMORY.md, create a daily log, update USER.md, etc.), push the updated file to the vault:

```bash
curl -s -X PUT "https://everclaw.chong-eae.workers.dev/v1/vault/MEMORY.md" \
  -H "Authorization: Bearer $EVERCLAW_API_KEY" \
  -H "Content-Type: text/markdown" \
  --data-binary @MEMORY.md
```

Use `--data-binary @filepath` to preserve file contents exactly. Use the correct content-type (`text/markdown` for .md, `application/json` for .json).

**Heartbeat sync:**
During heartbeat, check if any synced files have been modified since last backup and push them. This catches changes made outside of conversation.

**Recovery (on memory gap):**
If the user references something you should remember but don't (e.g., "remember when we discussed X?" and you have no record of X), try fetching the latest memory from the vault:

```bash
curl -s "https://everclaw.chong-eae.workers.dev/v1/vault/MEMORY.md" \
  -H "Authorization: Bearer $EVERCLAW_API_KEY"
```

This can recover memories lost to container resets or sync failures. If the vault has relevant context, update your local files and acknowledge the recovered memory. If the vault also lacks the memory, apologize and ask the user to re-share.

## Session transcripts (optional safety net)

For extra durability, periodically append conversation summaries to a transcript file:

```bash
curl -s -X POST "https://everclaw.chong-eae.workers.dev/v1/vault/transcripts/2026-02-03.md/_append" \
  -H "Authorization: Bearer $EVERCLAW_API_KEY" \
  -H "Content-Type: text/markdown" \
  --data-binary @- << 'EOF'
## 19:30 - User asked about X
- Discussed Y
- Decided Z
EOF
```

This creates a raw log even if MEMORY.md isn't updated. The append endpoint creates the file if it doesn't exist, or appends with a newline separator if it does.

## API reference

All requests require: `Authorization: Bearer $EVERCLAW_API_KEY`

| Operation | Method | Path | Notes |
|-----------|--------|------|-------|
| Save | `PUT` | `/v1/vault/{path}` | Returns `{"ok":true,"path":"...","size":N,"usage":N,"quota":N}` (201). 413 if quota exceeded. |
| Append | `POST` | `/v1/vault/{path}/_append` | Appends content to file (creates if missing). Returns same as Save. |
| Load | `GET` | `/v1/vault/{path}` | Returns decrypted file content. 404 if missing. |
| List | `GET` | `/v1/vault/` | Paginated. `?cursor=...&limit=100` (max 1000). Includes `usage` and `quota`. |
| Delete | `DELETE` | `/v1/vault/{path}` | Returns `{"ok":true,"deleted":"..."}`. 404 if missing. |
| Status | `GET` | `/v1/vault/status` | Returns `vaultId`, `fileCount`, `usage`, `quota`, and `lastSynced`. |
| Purge | `DELETE` | `/v1/vault/` | Deletes all files in the vault and resets usage to 0. |
| Batch | `POST` | `/v1/vault/_batch` | Upload up to 20 files (5MB total). See batch format below. |

Nested paths work: `memory/2026-02-02.md`, `memory/heartbeat-state.json`, etc.

### Batch upload format

```json
// Request
{
  "files": [
    { "path": "MEMORY.md", "content": "...", "contentType": "text/markdown" },
    { "path": "SOUL.md", "content": "...", "contentType": "text/markdown" }
  ]
}

// Response
{
  "ok": true,
  "results": [
    { "path": "MEMORY.md", "ok": true, "size": 1234 },
    { "path": "SOUL.md", "ok": true, "size": 567 }
  ],
  "uploaded": 2,
  "failed": 0,
  "usage": 1801,
  "quota": 52428800
}
```

Limits: max 20 files, max 5MB total per batch.

## Error handling

All error responses include `code` and `action` fields to help with recovery:

```json
{
  "ok": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "action": "What to do next"
}
```

| Code | Meaning | Action |
|------|---------|--------|
| `INVALID_API_KEY` | API key not recognized | Re-run /everclaw to provision a new vault |
| `QUOTA_EXCEEDED` | Storage limit reached | Delete unused files with DELETE /v1/vault/{path} |
| `RATE_LIMITED` | Too many requests | Wait a minute and try again |
| `FILE_NOT_FOUND` | File doesn't exist | File may not have been backed up yet |
| `DECRYPT_FAILED` | Decryption error | Data corrupted or wrong API key |
| `VALIDATION_ERROR` | Invalid request format | Check the request body structure |
| `BATCH_LIMIT_EXCEEDED` | Batch too large | Split into batches of 20 files / 5MB |

**When you encounter an error:**
1. Report the error message and code to the user
2. Follow the suggested action
3. If `INVALID_API_KEY`, offer to re-provision the vault

## Guardrails

- Never log or display the full `EVERCLAW_API_KEY`. Show only the last 8 characters if needed for debugging.
- Do not store secrets or credentials in the vault.
- Local files are the source of truth. Only restore from vault when local files are missing.
- If a request returns 401, the API key may be invalid. Offer to re-provision.
