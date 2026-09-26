import fs from 'node:fs';
import path from 'node:path';

type ProviderCredentialStore = Record<string, string>;

const credentialsPath = path.resolve(
  process.cwd(),
  'server',
  'data',
  '.provider_credentials.json'
);

function loadCredentials(): ProviderCredentialStore {
  try {
    if (!fs.existsSync(credentialsPath)) return {};
    const raw = fs.readFileSync(credentialsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCredentials(credentials: ProviderCredentialStore): void {
  const dir = path.dirname(credentialsPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });

  try {
    fs.chmodSync(credentialsPath, 0o600);
  } catch {
    // Best effort on platforms without chmod semantics.
  }
}

export function getProviderApiKey(providerId: string): string | undefined {
  const envKeysMap: Record<string, string[]> = {
    openrouter: ['OPENROUTER_API_KEY'],
    google_gemini: ['GEMINI_API_KEY', 'API_KEY', 'GOOGLE_API_KEY'],
    provider_google_gemini: ['GEMINI_API_KEY', 'API_KEY', 'GOOGLE_API_KEY'],
    google_imagen: ['GEMINI_API_KEY', 'API_KEY', 'GOOGLE_API_KEY'],
    google_cloud_tts: ['GEMINI_API_KEY', 'API_KEY', 'GOOGLE_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
  };

  const envNames = envKeysMap[providerId] || [];
  if (typeof process !== 'undefined') {
    for (const envName of envNames) {
      if (process.env?.[envName]) {
        return process.env[envName];
      }
    }
    if (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) {
      return undefined;
    }
  }

  return loadCredentials()[providerId];
}

export function setProviderApiKey(providerId: string, apiKey: string): void {
  const normalized = String(apiKey || '').trim();
  if (!normalized) throw new Error('API key cannot be empty.');

  const credentials = loadCredentials();
  credentials[providerId] = normalized;
  saveCredentials(credentials);

  // Keep the running server immediately usable without exposing the secret to clients.
  const envNames: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    google_gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  };
  const envName = envNames[providerId];
  if (envName && typeof process !== 'undefined') {
    process.env[envName] = normalized;
  }

  try {
    const { worldRepository } = require('../repositories/worldRepository');
    worldRepository.getAiOrchestrator().syncProviderModelAccessStatus(providerId, true);
  } catch {
    // Best effort if repo not initialized yet
  }
}

export function clearProviderApiKey(providerId: string): void {
  const credentials = loadCredentials();
  if (credentials[providerId]) {
    delete credentials[providerId];
    saveCredentials(credentials);
  }

  const envNames: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    google_gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  };
  const envName = envNames[providerId];
  if (envName && typeof process !== 'undefined') {
    delete process.env[envName];
  }

  try {
    const { worldRepository } = require('../repositories/worldRepository');
    worldRepository.getAiOrchestrator().syncProviderModelAccessStatus(providerId, false);
  } catch {
    // Best effort if repo not initialized yet
  }
}

export function isProviderConfigured(providerId: string): boolean {
  return Boolean(getProviderApiKey(providerId));
}
