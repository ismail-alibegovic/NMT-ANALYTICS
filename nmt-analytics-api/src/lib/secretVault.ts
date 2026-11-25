import crypto from 'crypto';

const PREFIX = 'v1';

function resolveMasterKey(explicitKey?: string): Buffer {
  const raw = (explicitKey ?? process.env.AI_SECRETS_ENCRYPTION_KEY ?? '').trim();
  if (!raw || raw.length < 16) {
    throw new Error('AI_SECRETS_ENCRYPTION_KEY is missing or too short (minimum 16 characters required)');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptSecret(plaintext: string, masterKey?: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Secret plaintext must be a non-empty string');
  }
  const key = resolveMasterKey(masterKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(payload: string, masterKey?: string): string {
  if (!payload || typeof payload !== 'string') {
    throw new Error('Encrypted payload must be a non-empty string');
  }
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Unsupported encrypted secret format');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = resolveMasterKey(masterKey);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskSecret(plaintext: string): string {
  const trimmed = (plaintext || '').trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
