// src/models.ts
import { readFileSync } from 'node:fs';
import type { ModelInfo, BackendConfig } from './types.js';
import { OPENCODE_CACHE_PATH } from './constants.js';

const BRAND_MAP: Array<[string, string]> = [
  ['claude', 'Claude'],
  ['gpt', 'GPT'],
  ['gemini', 'Gemini'],
  ['deepseek', 'DeepSeek'],
  ['qwen', 'Qwen'],
  ['minimax', 'MiniMax'],
  ['kimi', 'Kimi'],
  ['glm', 'GLM'],
  ['mimo', 'MiMo'],
  ['grok', 'Grok'],
  ['nemotron', 'Nemotron'],
];

export function deriveBrand(family: string): string {
  const lower = family.toLowerCase();
  for (const [prefix, brand] of BRAND_MAP) {
    if (lower.startsWith(prefix)) return brand;
  }
  return 'Other';
}

interface CacheModelEntry {
  id: string;
  name?: string;
  family?: string;
  status?: string;
  provider?: { npm?: string };
  cost?: { input: number; output: number };
}

interface CacheFile {
  [providerKey: string]: {
    models?: Record<string, CacheModelEntry>;
  };
}

export function readModelsFromCache(
  backendId: 'zen' | 'go',
): Map<string, ModelInfo> | null {
  try {
    const raw = readFileSync(OPENCODE_CACHE_PATH, 'utf8');
    const cache = JSON.parse(raw) as CacheFile;
    const providerKey = backendId === 'zen' ? 'opencode' : 'opencode-go';
    const providerData = cache[providerKey];
    if (!providerData?.models) return null;

    const result = new Map<string, ModelInfo>();
    for (const entry of Object.values(providerData.models)) {
      if (entry.status === 'deprecated') continue;
      const isFree =
        entry.cost !== undefined &&
        entry.cost.input === 0 &&
        entry.cost.output === 0;
      const isAnthropicNative = entry.provider?.npm === '@ai-sdk/anthropic';
      result.set(entry.id, {
        id: entry.id,
        name: entry.name ?? entry.id,
        isFree,
        brand: deriveBrand(entry.family ?? ''),
        isAnthropicNative,
        sourceBackend: backendId,
        cost: entry.cost,
      });
    }
    return result;
  } catch {
    return null;
  }
}

interface ApiModelsResponse {
  data: Array<{ id: string }>;
}

export async function fetchModelsFromApi(backend: BackendConfig): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${backend.baseUrl}/models`, {
      signal: controller.signal,
      headers: { Authorization: 'Bearer test' },
    });
    if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
    const body = (await res.json()) as ApiModelsResponse;
    return body.data.map(m => m.id);
  } finally {
    clearTimeout(timer);
  }
}

export function mergeModels(
  apiIds: string[],
  cache: Map<string, ModelInfo> | null,
  backendId: 'zen' | 'go',
): ModelInfo[] {
  return apiIds.map(id => {
    const cached = cache?.get(id);
    return cached ?? {
      id,
      name: id,
      isFree: false,
      brand: 'Other',
      isAnthropicNative: false,
      sourceBackend: backendId,
    };
  });
}

export function groupModels(models: ModelInfo[]): {
  free: ModelInfo[];
  byBrand: Map<string, ModelInfo[]>;
} {
  const free = models
    .filter(m => m.isFree)
    .sort((a, b) => a.id.localeCompare(b.id));

  const byBrand = new Map<string, ModelInfo[]>();
  for (const m of models.filter(m => !m.isFree)) {
    const list = byBrand.get(m.brand) ?? [];
    list.push(m);
    byBrand.set(m.brand, list);
  }
  for (const [brand, list] of byBrand) {
    byBrand.set(brand, list.sort((a, b) => a.id.localeCompare(b.id)));
  }
  return { free, byBrand };
}

export async function getModels(
  backend: BackendConfig,
  fallbackModels?: ModelInfo[],
): Promise<{ models: ModelInfo[]; fromCache: boolean }> {
  const cache = readModelsFromCache(backend.id);

  try {
    const apiIds = await fetchModelsFromApi(backend);
    return { models: mergeModels(apiIds, cache, backend.id), fromCache: false };
  } catch {
    if (cache && cache.size > 0) {
      return { models: [...cache.values()], fromCache: true };
    }
    if (fallbackModels && fallbackModels.length > 0) {
      return { models: fallbackModels, fromCache: true };
    }
    throw new Error(
      'Cannot fetch models. Check your network and https://opencode.ai status.',
    );
  }
}
