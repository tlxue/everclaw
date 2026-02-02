export interface Env {
  VAULT_BUCKET: R2Bucket;
  API_KEYS: KVNamespace;
  ENVIRONMENT: string;
  VAULT_QUOTA_MB: string;
}

export interface ApiKeyMetadata {
  vaultId: string;
  name: string;
}

export interface VaultContext {
  vaultId: string;
  keyName: string;
  apiKey: string;
}

export class VaultError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
