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

export type ErrorCode =
  | "INVALID_API_KEY"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "FILE_NOT_FOUND"
  | "DECRYPT_FAILED"
  | "VALIDATION_ERROR"
  | "BATCH_LIMIT_EXCEEDED";

export class VaultError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: ErrorCode,
    public action?: string,
  ) {
    super(message);
  }
}
