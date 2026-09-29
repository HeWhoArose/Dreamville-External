import fs from 'node:fs';
import path from 'node:path';

export interface CustomProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  protocol?: 'openai_compatible' | 'anthropic' | 'custom_rest';
  apiKey?: string;
  headers?: Record<string, string>;
  modalities?: string[];
  models?: Array<{
    id: string;
    name?: string;
    contextWindow?: number;
    pool?: string;
  }>;
  createdAt?: number;
}

type ProviderCredentialStore = Record<string, string>;

const credentialsPath = path.resolve(
  process.cwd(),
  'server',
  'data',
  '.provider_credentials.json'
);

const customProvidersPath = path.resolve(
  process.cwd(),
  'server',
  'data',
  'custom_providers.json'
);

export const DEFAULT_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  together: 'https://api.together.xyz/v1',
  perplexity: 'https://api.perplexity.ai',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
  xai: 'https://api.x.ai/v1',
};

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

export function loadCustomProviders(): CustomProviderConfig[] {
  try {
    if (!fs.existsSync(customProvidersPath)) return [];
    const raw = fs.readFileSync(customProvidersPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomProviders(providers: CustomProviderConfig[]): void {
  const dir = path.dirname(customProvidersPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(customProvidersPath, JSON.stringify(providers, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function getCustomProvider(providerId: string): CustomProviderConfig | undefined {
  const providers = loadCustomProviders();
  return providers.find((p) => p.id.toLowerCase() === providerId.toLowerCase());
}

export function saveCustomProvider(config: CustomProviderConfig): void {
  const normalizedId = config.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const providers = loadCustomProviders().filter((p) => p.id !== normalizedId);
  const updated: CustomProviderConfig = {
    ...config,
    id: normalizedId,
    name: config.name.trim() || normalizedId,
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ''),
    protocol: config.protocol || 'openai_compatible',
    modalities: config.modalities || ['Text', 'Multimodal'],
    createdAt: config.createdAt || Date.now(),
  };

  if (config.apiKey) {
    setProviderApiKey(normalizedId, config.apiKey);
  }

  providers.push(updated);
  saveCustomProviders(providers);

  try {
    const { worldRepository } = require('../repositories/worldRepository');
    worldRepository.getAiOrchestrator().registerCustomProvider(updated);
  } catch {
    // Best effort if repo not initialized yet
  }
}

export function deleteCustomProvider(providerId: string): void {
  const normalizedId = providerId.trim().toLowerCase();
  const providers = loadCustomProviders().filter((p) => p.id !== normalizedId);
  saveCustomProviders(providers);
  clearProviderApiKey(normalizedId);

  try {
    const { worldRepository } = require('../repositories/worldRepository');
    worldRepository.getAiOrchestrator().removeCustomProvider(normalizedId);
  } catch {
    // Best effort if repo not initialized yet
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
    groq: ['GROQ_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
    mistral: ['MISTRAL_API_KEY'],
    together: ['TOGETHER_API_KEY'],
    perplexity: ['PERPLEXITY_API_KEY'],
    xai: ['XAI_API_KEY'],
  };

  const envNames = envKeysMap[providerId.toLowerCase()] || [];
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

  const saved = loadCredentials()[providerId.toLowerCase()];
  if (saved) return saved;

  const custom = getCustomProvider(providerId);
  return custom?.apiKey;
}

export function setProviderApiKey(providerId: string, apiKey: string): void {
  const normalizedKey = String(apiKey || '').trim();
  const normalizedId = providerId.trim().toLowerCase();
  if (!normalizedKey) throw new Error('API key cannot be empty.');

  const credentials = loadCredentials();
  credentials[normalizedId] = normalizedKey;
  saveCredentials(credentials);

  // Keep the running server immediately usable without exposing the secret to clients.
  const envNames: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    google_gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    together: 'TOGETHER_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    xai: 'XAI_API_KEY',
  };
  const envName = envNames[normalizedId];
  if (envName && typeof process !== 'undefined') {
    process.env[envName] = normalizedKey;
  }

  try {
    const { worldRepository } = require('../repositories/worldRepository');
    worldRepository.getAiOrchestrator().syncProviderModelAccessStatus(normalizedId, true);
  } catch {
    // Best effort if repo not initialized yet
  }
}

export function clearProviderApiKey(providerId: string): void {
  const normalizedId = providerId.trim().toLowerCase();
  const credentials = loadCredentials();
  if (credentials[normalizedId]) {
    delete credentials[normalizedId];
    saveCredentials(credentials);
  }

  const envNames: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    google_gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    together: 'TOGETHER_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    xai: 'XAI_API_KEY',
  };
  const envName = envNames[normalizedId];
  if (envName && typeof process !== 'undefined') {
    delete process.env[envName];
  }

  try {
    const { worldRepository } = require('../repositories/worldRepository');
    worldRepository.getAiOrchestrator().syncProviderModelAccessStatus(normalizedId, false);
  } catch {
    // Best effort if repo not initialized yet
  }
}

export function isProviderConfigured(providerId: string): boolean {
  const normalizedId = providerId.trim().toLowerCase();
  const custom = getCustomProvider(normalizedId);
  if (custom?.baseUrl?.includes('localhost') || custom?.baseUrl?.includes('127.0.0.1')) {
    return true; // Local endpoints like Ollama / LM Studio are accessible without an API key
  }
  return Boolean(getProviderApiKey(normalizedId));
}

export function getProviderBaseUrl(providerId: string): string | undefined {
  const normalizedId = providerId.trim().toLowerCase();
  const custom = getCustomProvider(normalizedId);
  if (custom?.baseUrl) return custom.baseUrl;
  return DEFAULT_PROVIDER_BASE_URLS[normalizedId];
}

export function setProviderBaseUrl(providerId: string, baseUrl: string): void {
  const normalizedId = providerId.trim().toLowerCase();
  const existing = getCustomProvider(normalizedId);
  if (existing) {
    existing.baseUrl = baseUrl.trim();
    saveCustomProvider(existing);
  }
}

