# Everclaw

Encrypted cloud memory for AI agents. Your API key is generated on your device and never stored on the server — only a SHA-256 hash. Everything your agent saves is AES-256-GCM encrypted at rest in R2.

## Features

- **Server-side encryption at rest** — AES-256-GCM; the server encrypts data before writing to R2
- **Hashed auth** — API keys are generated locally; the server only stores a SHA-256 hash
- **One key, full recovery** — switch devices, reinstall, enter your API key, and all your memory is back
- **Nested file paths** — store any file structure (`memory/2026-02-02.md`, `config/prefs.json`, etc.)
- **Storage quotas** — configurable per-vault limits (default 50 MB) with usage tracking
- **Self-hostable** — deploy to your own Cloudflare account in minutes
- **OpenClaw compatible** — works as a ClawHub skill for automatic agent memory sync

## Quick start

### Self-host

```bash
git clone https://github.com/tlxue/everclaw.git
cd everclaw
npm install
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your Cloudflare account ID and KV namespace ID
wrangler deploy
```

### Hosted version

Use the hosted instance at `https://everclaw.chong-eae.workers.dev`. No setup required — just provision a vault and start syncing.

## API reference

All requests require `Authorization: Bearer <API_KEY>`.

| Operation | Method | Path | Notes |
|-----------|--------|------|-------|
| Provision | `POST` | `/v1/provision` | Create a new vault. Body: `{"name":"...","apiKey":"..."}` |
| Save | `PUT` | `/v1/vault/{path}` | Store a file. Returns `{"ok":true,"path":"...","size":N,"usage":N,"quota":N}` |
| Load | `GET` | `/v1/vault/{path}` | Retrieve a decrypted file. 404 if missing. |
| List | `GET` | `/v1/vault/` | Paginated. `?cursor=...&limit=100` (max 1000). Includes `usage` and `quota`. |
| Delete | `DELETE` | `/v1/vault/{path}` | Delete a single file. 404 if missing. |
| Purge | `DELETE` | `/v1/vault/` | Delete all files in the vault and reset usage to 0. |
| Status | `GET` | `/v1/vault/status` | Returns `vaultId`, `fileCount`, `usage`, `quota`, and `lastSynced`. |
| Health | `GET` | `/health` | Returns `{"ok":true}`. No auth required. |

## Security model

Everclaw uses server-side encryption at rest:

1. **Key generation** — The client generates a random 64-character hex API key (`ec-<hex>`)
2. **Key derivation** — HKDF derives an encryption key from the API key; this happens in Worker memory
3. **Encryption** — All file contents are encrypted with AES-256-GCM before writing to R2
4. **Auth** — The server stores only a SHA-256 hash of the API key in KV; the raw key is not persisted
5. **Storage** — File paths are stored as-is in R2 object keys; operators with R2 access can see filenames

If you lose your API key, your data is unrecoverable. There is no password reset.

### Trust model

- Plaintext exists transiently in Worker memory during request processing. You must trust the server operator, or self-host.
- Storage paths are **not** obfuscated — R2 object keys contain the original filenames.
- Quota enforcement and provision rate limiting use non-atomic KV counters. Concurrent requests can theoretically race past limits, but each vault is single-user so this is unlikely in practice. Self-hosters can adjust `VAULT_QUOTA_MB` if concerned.

## Development

```bash
npm install
cp wrangler.toml.example wrangler.toml
# Fill in your account_id and KV namespace id
npm run dev        # Start local dev server
npm run typecheck  # Type-check without emitting
npm run deploy     # Deploy to Cloudflare Workers
```

Create a KV namespace for API keys:

```bash
wrangler kv namespace create API_KEYS
# Copy the id into wrangler.toml
```

Create an R2 bucket:

```bash
wrangler r2 bucket create everclaw
```

## ClawHub

Everclaw is available as a skill on [ClawHub](https://www.clawhub.ai/tlxue/everclaw). Install it to give your OpenClaw agent automatic encrypted memory sync.

> **Note:** The `clawdhub` CLI has a known auth bug where the default registry URL redirects and strips the Authorization header. Always pass `--registry "https://www.clawhub.ai"` explicitly when using `clawdhub login` or `clawdhub publish`.

## License

[MIT](LICENSE)
