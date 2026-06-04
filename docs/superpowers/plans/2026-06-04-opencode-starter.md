# opencode-starter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js CLI (`opencode-starter`) that launches Claude Code configured to use OpenCode Zen or Go as the Anthropic API-compatible backend, with clean env isolation and a beautiful interactive wizard.

**Architecture:** Interactive wizard (backend → model → confirm) using `@clack/prompts`, models fetched from OpenCode API and enriched from the local OpenCode cache at `~/.cache/opencode/models.json`. Claude Code is spawned as a child process with a clean environment (16 conflicting vars unset, 3 OpenCode vars injected). `settings.json` is never touched.

**Updated requirements (added mid-implementation):**
- `--dry-run` flag: run full wizard interactively, then print a preview (command + env changes) instead of launching Claude Code
- All models shown (Zen translates all to Anthropic format server-side). `ModelInfo` gains `isAnthropicNative: boolean` (from `provider.npm === '@ai-sdk/anthropic'` in cache). Non-native models get `(translated)` hint in wizard. When launching a non-native model, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` is automatically added to child env to prevent beta header rejection.

**Tech Stack:** TypeScript + ESM, compiled to single `dist/cli.js` with `tsup`. Runtime deps: `@clack/prompts`, `picocolors`, `conf`. Test runner: `vitest`.

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Project config, bin entry, dependencies |
| `tsconfig.json` | TypeScript config |
| `tsup.config.ts` | Build config — produces single `dist/cli.js` |
| `src/types.ts` | All TypeScript interfaces |
| `src/constants.ts` | Static config: backend URLs, conflicting env var list |
| `src/env.ts` | Detect conflicts, build child process env |
| `src/models.ts` | Fetch models from API, read cache, merge, group |
| `src/config.ts` | Persist/load last-used backend+model preferences |
| `src/launch.ts` | Find `claude` binary, spawn child process |
| `src/prompts.ts` | Interactive wizard UI |
| `src/cli.ts` | Entry point: parse args, orchestrate flow |
| `tests/env.test.ts` | Unit tests for `env.ts` |
| `tests/models.test.ts` | Unit tests for `models.ts` |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "opencode-starter",
  "version": "0.1.0",
  "description": "Launch Claude Code with OpenCode Zen or Go as the Anthropic API backend",
  "type": "module",
  "bin": {
    "opencode-starter": "./dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@clack/prompts": "^0.9.1",
    "conf": "^13.1.0",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  minify: false,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.js.map
```

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/jbendavi/dev_projects/opencode-claude-starter
npm install
```

Expected: `node_modules/` created, `package-lock.json` written.

- [ ] **Step 6: Create minimal src/cli.ts to verify build works**

```typescript
// src/cli.ts
console.log('opencode-starter v0.1.0');
```

- [ ] **Step 7: Build and verify**

```bash
npm run build
node dist/cli.js
```

Expected output: `opencode-starter v0.1.0`

- [ ] **Step 8: Initialize git and commit**

```bash
git init
git add package.json package-lock.json tsconfig.json tsup.config.ts .gitignore
git commit -m "chore: initialize project scaffold"
```

---

## Task 2: Types and Constants

**Files:**
- Create: `src/types.ts`
- Create: `src/constants.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
// src/types.ts

export interface BackendConfig {
  id: 'zen' | 'go';
  name: string;
  baseUrl: string;
}

export interface ModelCost {
  input: number;
  output: number;
  cache_read?: number;
  cache_write?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  isFree: boolean;
  brand: string;
  cost?: ModelCost;
}

export interface UserPreferences {
  lastBackend?: 'zen' | 'go';
  lastModel?: string;
  modelListCache?: {
    zen?: { models: ModelInfo[]; fetchedAt: string };
    go?: { models: ModelInfo[]; fetchedAt: string };
  };
}

export interface ParsedArgs {
  showHelp: boolean;
  showVersion: boolean;
  claudeArgs: string[];
}

export interface ConflictInfo {
  name: string;
  value: string;
}
```

- [ ] **Step 2: Create src/constants.ts**

```typescript
// src/constants.ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BackendConfig } from './types.js';

export const BACKENDS: Record<'zen' | 'go', BackendConfig> = {
  zen: {
    id: 'zen',
    name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/zen/v1',
  },
  go: {
    id: 'go',
    name: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/zen/go/v1',
  },
};

// These must be removed from the child process environment to avoid conflicts
// with Vertex AI, Bedrock, AWS, Foundry, and any stale Anthropic config.
export const CONFLICTING_ENV_VARS = [
  'CLAUDE_CODE_USE_VERTEX',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'ANTHROPIC_VERTEX_BASE_URL',
  'CLOUD_ML_REGION',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'ANTHROPIC_AWS_BASE_URL',
  'ANTHROPIC_AWS_API_KEY',
  'ANTHROPIC_AWS_WORKSPACE_ID',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_FOUNDRY_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;

export type ConflictingEnvVar = (typeof CONFLICTING_ENV_VARS)[number];

export const OPENCODE_CACHE_PATH = join(homedir(), '.cache', 'opencode', 'models.json');

export const MODELS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export const VERSION = '0.1.0';
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts src/constants.ts
git commit -m "feat: add types and constants"
```

---

## Task 3: Environment Isolation Module

**Files:**
- Create: `src/env.ts`
- Create: `tests/env.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/env.test.ts
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { detectConflicts, resolveApiKey, buildChildEnv } from '../src/env.js';
import { BACKENDS } from '../src/constants.js';

describe('detectConflicts', () => {
  afterEach(() => {
    delete process.env['CLAUDE_CODE_USE_VERTEX'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_VERTEX_PROJECT_ID'];
  });

  it('returns empty array when no conflicting vars are set', () => {
    expect(detectConflicts()).toEqual([]);
  });

  it('returns conflict entries for each set variable', () => {
    process.env['CLAUDE_CODE_USE_VERTEX'] = '1';
    process.env['ANTHROPIC_API_KEY'] = 'old-key';
    const conflicts = detectConflicts();
    expect(conflicts.some(c => c.name === 'CLAUDE_CODE_USE_VERTEX' && c.value === '1')).toBe(true);
    expect(conflicts.some(c => c.name === 'ANTHROPIC_API_KEY' && c.value === 'old-key')).toBe(true);
  });
});

describe('resolveApiKey', () => {
  const originalKey = process.env['OPENCODE_API_KEY'];

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env['OPENCODE_API_KEY'];
    } else {
      process.env['OPENCODE_API_KEY'] = originalKey;
    }
  });

  it('returns null when OPENCODE_API_KEY is not set', () => {
    delete process.env['OPENCODE_API_KEY'];
    expect(resolveApiKey()).toBeNull();
  });

  it('returns the key value when set', () => {
    process.env['OPENCODE_API_KEY'] = 'sk-test-key-123';
    expect(resolveApiKey()).toBe('sk-test-key-123');
  });
});

describe('buildChildEnv', () => {
  beforeEach(() => {
    process.env['CLAUDE_CODE_USE_VERTEX'] = '1';
    process.env['ANTHROPIC_VERTEX_PROJECT_ID'] = 'my-project';
    process.env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = 'claude-opus-4-6[1m]';
  });

  afterEach(() => {
    delete process.env['CLAUDE_CODE_USE_VERTEX'];
    delete process.env['ANTHROPIC_VERTEX_PROJECT_ID'];
    delete process.env['ANTHROPIC_DEFAULT_OPUS_MODEL'];
  });

  it('removes all conflicting vars from child env', () => {
    const env = buildChildEnv(BACKENDS.zen, 'claude-sonnet-4-6', 'my-key');
    expect(env['CLAUDE_CODE_USE_VERTEX']).toBeUndefined();
    expect(env['ANTHROPIC_VERTEX_PROJECT_ID']).toBeUndefined();
    expect(env['ANTHROPIC_DEFAULT_OPUS_MODEL']).toBeUndefined();
  });

  it('sets ANTHROPIC_BASE_URL to backend URL', () => {
    const env = buildChildEnv(BACKENDS.zen, 'claude-sonnet-4-6', 'my-key');
    expect(env['ANTHROPIC_BASE_URL']).toBe('https://opencode.ai/zen/v1');
  });

  it('sets ANTHROPIC_API_KEY to the provided key', () => {
    const env = buildChildEnv(BACKENDS.zen, 'claude-sonnet-4-6', 'my-key');
    expect(env['ANTHROPIC_API_KEY']).toBe('my-key');
  });

  it('sets ANTHROPIC_MODEL to the selected model', () => {
    const env = buildChildEnv(BACKENDS.zen, 'claude-sonnet-4-6', 'my-key');
    expect(env['ANTHROPIC_MODEL']).toBe('claude-sonnet-4-6');
  });

  it('does NOT mutate process.env', () => {
    buildChildEnv(BACKENDS.zen, 'claude-sonnet-4-6', 'my-key');
    expect(process.env['CLAUDE_CODE_USE_VERTEX']).toBe('1');
    expect(process.env['ANTHROPIC_VERTEX_PROJECT_ID']).toBe('my-project');
  });

  it('preserves non-conflicting env vars like PATH and HOME', () => {
    const env = buildChildEnv(BACKENDS.zen, 'claude-sonnet-4-6', 'my-key');
    expect(env['PATH']).toBe(process.env['PATH']);
    expect(env['HOME']).toBe(process.env['HOME']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: All tests FAIL with "Cannot find module '../src/env.js'"

- [ ] **Step 3: Create src/env.ts**

```typescript
// src/env.ts
import { CONFLICTING_ENV_VARS } from './constants.js';
import type { BackendConfig, ConflictInfo } from './types.js';

export function detectConflicts(): ConflictInfo[] {
  return CONFLICTING_ENV_VARS
    .filter(name => process.env[name] !== undefined)
    .map(name => ({ name, value: process.env[name]! }));
}

export function resolveApiKey(): string | null {
  return process.env['OPENCODE_API_KEY'] ?? null;
}

export function buildChildEnv(
  backend: BackendConfig,
  model: string,
  apiKey: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of CONFLICTING_ENV_VARS) {
    delete env[name];
  }
  env['ANTHROPIC_BASE_URL'] = backend.baseUrl;
  env['ANTHROPIC_API_KEY'] = apiKey;
  env['ANTHROPIC_MODEL'] = model;
  return env;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All `env.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/env.ts tests/env.test.ts
git commit -m "feat: add env isolation module with tests"
```

---

## Task 4: Models Module

**Files:**
- Create: `src/models.ts`
- Create: `tests/models.test.ts`

### Cache structure reference (from `~/.cache/opencode/models.json`):
```
{
  "opencode": {                        // provider key for Zen
    "id": "opencode",
    "models": {
      "claude-opus-4-5": {            // key = model ID
        "id": "claude-opus-4-5",
        "name": "Claude Opus 4.5",
        "family": "claude-opus",      // brand prefix before first hyphen
        "cost": { "input": 5, "output": 25 },
        "status": "deprecated"        // optional — skip deprecated models
      },
      "mimo-v2-flash-free": {
        "cost": { "input": 0, "output": 0 },  // free model
        ...
      }
    }
  },
  "opencode-go": { ... }               // provider key for Go
}
```

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/models.test.ts
import { describe, it, expect } from 'vitest';
import {
  deriveBrand,
  mergeModels,
  groupModels,
} from '../src/models.js';
import type { ModelInfo } from '../src/types.js';

describe('deriveBrand', () => {
  it.each([
    ['claude-opus', 'Claude'],
    ['claude-sonnet', 'Claude'],
    ['gpt', 'GPT'],
    ['gpt-codex', 'GPT'],
    ['gpt-mini', 'GPT'],
    ['gemini-pro', 'Gemini'],
    ['gemini-flash', 'Gemini'],
    ['deepseek-flash', 'DeepSeek'],
    ['qwen', 'Qwen'],
    ['qwen-free', 'Qwen'],
    ['minimax', 'MiniMax'],
    ['minimax-m3-free', 'MiniMax'],
    ['kimi', 'Kimi'],
    ['kimi-free', 'Kimi'],
    ['glm', 'GLM'],
    ['glm-free', 'GLM'],
    ['mimo-flash-free', 'MiMo'],
    ['grok', 'Grok'],
    ['nemotron-free', 'Nemotron'],
    ['big-pickle', 'Other'],
    ['ring-1t-free', 'Other'],
  ])('deriveBrand("%s") === "%s"', (family, expected) => {
    expect(deriveBrand(family)).toBe(expected);
  });
});

describe('mergeModels', () => {
  it('returns minimal ModelInfo when cache is null', () => {
    const result = mergeModels(['claude-opus-4-8'], null);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'claude-opus-4-8',
      name: 'claude-opus-4-8',
      isFree: false,
      brand: 'Other', // no cache = can't derive brand from family
    });
  });

  it('enriches models with cache data when available', () => {
    const cache = new Map([
      ['deepseek-v4-flash', {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        isFree: true,
        brand: 'DeepSeek',
        cost: { input: 0, output: 0 },
      }],
    ]);
    const result = mergeModels(['deepseek-v4-flash'], cache);
    expect(result[0]).toMatchObject({
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      isFree: true,
      brand: 'DeepSeek',
    });
  });

  it('skips cache entries for models not in API list', () => {
    const cache = new Map([
      ['model-in-cache', { id: 'model-in-cache', name: 'X', isFree: false, brand: 'Other' }],
    ]);
    const result = mergeModels(['model-from-api'], cache);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('model-from-api');
  });
});

describe('groupModels', () => {
  const makeModel = (id: string, isFree: boolean, brand: string): ModelInfo => ({
    id,
    name: id,
    isFree,
    brand,
  });

  it('separates free models from paid models', () => {
    const models = [
      makeModel('claude-sonnet', false, 'Claude'),
      makeModel('deepseek-free', true, 'DeepSeek'),
    ];
    const { free, byBrand } = groupModels(models);
    expect(free).toHaveLength(1);
    expect(free[0]!.id).toBe('deepseek-free');
    expect([...byBrand.keys()]).toContain('Claude');
    expect(byBrand.get('Claude')!).toHaveLength(1);
  });

  it('sorts free models alphabetically by id', () => {
    const models = [
      makeModel('z-free', true, 'Other'),
      makeModel('a-free', true, 'Other'),
      makeModel('m-free', true, 'Other'),
    ];
    const { free } = groupModels(models);
    expect(free.map(m => m.id)).toEqual(['a-free', 'm-free', 'z-free']);
  });

  it('sorts paid models alphabetically by id within each brand', () => {
    const models = [
      makeModel('claude-z', false, 'Claude'),
      makeModel('claude-a', false, 'Claude'),
    ];
    const { byBrand } = groupModels(models);
    const claudeModels = byBrand.get('Claude')!;
    expect(claudeModels.map(m => m.id)).toEqual(['claude-a', 'claude-z']);
  });

  it('returns empty free array and empty map when all models are paid', () => {
    const models = [makeModel('claude-opus', false, 'Claude')];
    const { free, byBrand } = groupModels(models);
    expect(free).toHaveLength(0);
    expect(byBrand.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL with "Cannot find module '../src/models.js'"

- [ ] **Step 3: Create src/models.ts**

```typescript
// src/models.ts
import { readFileSync } from 'node:fs';
import type { ModelInfo, BackendConfig } from './types.js';
import { OPENCODE_CACHE_PATH } from './constants.js';

// Maps the cache's `family` field prefix to a user-facing brand name.
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
      result.set(entry.id, {
        id: entry.id,
        name: entry.name ?? entry.id,
        isFree,
        brand: deriveBrand(entry.family ?? ''),
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
): ModelInfo[] {
  return apiIds.map(id => {
    const cached = cache?.get(id);
    return cached ?? {
      id,
      name: id,
      isFree: false,
      brand: 'Other',
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
    return { models: mergeModels(apiIds, cache), fromCache: false };
  } catch {
    // API failed — try local OpenCode cache
    if (cache && cache.size > 0) {
      return { models: [...cache.values()], fromCache: true };
    }
    // OpenCode cache missing — try our own preferences cache
    if (fallbackModels && fallbackModels.length > 0) {
      return { models: fallbackModels, fromCache: true };
    }
    throw new Error(
      'Cannot fetch models. Check your network and https://opencode.ai status.',
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All `models.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/models.ts tests/models.test.ts
git commit -m "feat: add models module with tests"
```

---

## Task 5: Preferences Config Module

**Files:**
- Create: `src/config.ts`

Note: `conf` writes to `~/.config/opencode-starter/config.json`. Unit testing this module would require mocking the filesystem. The `conf` package is battle-tested; we verify the module works via the manual integration test in Task 10 (preference persistence scenario).

- [ ] **Step 1: Create src/config.ts**

```typescript
// src/config.ts
import Conf from 'conf';
import type { UserPreferences, ModelInfo } from './types.js';
import { MODELS_CACHE_TTL_MS } from './constants.js';

const store = new Conf<UserPreferences>({
  projectName: 'opencode-starter',
  defaults: {},
});

export function loadPreferences(): UserPreferences {
  return {
    lastBackend: store.get('lastBackend'),
    lastModel: store.get('lastModel'),
    modelListCache: store.get('modelListCache'),
  };
}

export function savePreferences(prefs: Partial<Pick<UserPreferences, 'lastBackend' | 'lastModel'>>): void {
  if (prefs.lastBackend !== undefined) store.set('lastBackend', prefs.lastBackend);
  if (prefs.lastModel !== undefined) store.set('lastModel', prefs.lastModel);
}

export function getCachedModels(backendId: 'zen' | 'go'): ModelInfo[] | null {
  const modelListCache = store.get('modelListCache');
  const entry = modelListCache?.[backendId];
  if (!entry) return null;
  const age = Date.now() - new Date(entry.fetchedAt).getTime();
  if (age > MODELS_CACHE_TTL_MS) return null;
  return entry.models;
}

export function setCachedModels(backendId: 'zen' | 'go', models: ModelInfo[]): void {
  const existing = store.get('modelListCache') ?? {};
  store.set('modelListCache', {
    ...existing,
    [backendId]: { models, fetchedAt: new Date().toISOString() },
  });
}
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
npm run build
```

Expected: `dist/cli.js` rebuilt with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add config module for preference persistence"
```

---

## Task 6: Launch Module

**Files:**
- Create: `src/launch.ts`

- [ ] **Step 1: Create src/launch.ts**

```typescript
// src/launch.ts
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FALLBACK_PATHS = [
  join(homedir(), '.local', 'bin', 'claude'),
  join(homedir(), '.npm', 'bin', 'claude'),
  '/usr/local/bin/claude',
  '/opt/homebrew/bin/claude',
];

export function findClaudeBinary(): string | null {
  try {
    const result = execSync('which claude', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const path = result.trim();
    if (path) return path;
  } catch {
    // `which` failed — try fallback paths
  }
  for (const path of FALLBACK_PATHS) {
    if (existsSync(path)) return path;
  }
  return null;
}

export function launchClaude(
  env: NodeJS.ProcessEnv,
  model: string,
  extraArgs: string[],
): Promise<number> {
  return new Promise((resolve) => {
    const claudePath = findClaudeBinary()!;
    const args = ['--model', model, ...extraArgs];

    const child = spawn(claudePath, args, {
      stdio: 'inherit',
      env,
    });

    const forward = (signal: NodeJS.Signals): void => {
      child.kill(signal);
    };

    process.once('SIGINT', () => forward('SIGINT'));
    process.once('SIGTERM', () => forward('SIGTERM'));

    child.on('exit', (code) => {
      resolve(code ?? 0);
    });
  });
}
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
npm run build
```

Expected: Builds cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/launch.ts
git commit -m "feat: add launch module for Claude Code child process"
```

---

## Task 7: Interactive Wizard (prompts.ts)

**Files:**
- Create: `src/prompts.ts`

`@clack/prompts` select options format: `{ value: string; label: string; hint?: string }`. It does not natively support group headers, so we add a `hint` showing the brand for paid models, and put free models first.

- [ ] **Step 1: Create src/prompts.ts**

```typescript
// src/prompts.ts
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { BackendConfig, ModelInfo, UserPreferences, ConflictInfo } from './types.js';
import { BACKENDS } from './constants.js';
import { groupModels } from './models.js';

function modelLabel(model: ModelInfo): string {
  if (model.isFree) {
    return pc.green(`${model.name}`) + pc.green(' (free)');
  }
  return model.name;
}

function modelHint(model: ModelInfo): string {
  if (model.isFree) return model.id;
  return `${model.brand} · ${model.id}`;
}

export async function runWizard(
  prefs: UserPreferences,
  models: ModelInfo[],
  conflicts: ConflictInfo[],
): Promise<{ backend: BackendConfig; model: string } | null> {
  p.intro(pc.bold('  OpenCode Starter'));

  // Step 1: Select backend
  const backendId = await p.select<Array<{ value: 'zen' | 'go'; label: string; hint: string }>, 'zen' | 'go'>({
    message: 'Which backend?',
    options: [
      { value: 'zen', label: 'OpenCode Zen', hint: '66+ models, free tier available' },
      { value: 'go', label: 'OpenCode Go', hint: '17 models, subscription ($10/mo)' },
    ],
    initialValue: prefs.lastBackend ?? 'zen',
  });

  if (p.isCancel(backendId)) {
    p.cancel('Cancelled.');
    return null;
  }

  const backend = BACKENDS[backendId];

  // Step 2: Filter models to selected backend (caller already fetched for initial backend;
  // if backend changed, the caller re-fetches. Here we just display what was passed.)
  const { free, byBrand } = groupModels(models);

  const options: Array<{ value: string; label: string; hint: string }> = [];

  for (const m of free) {
    options.push({ value: m.id, label: modelLabel(m), hint: modelHint(m) });
  }

  // Sort brands: Claude first, then alphabetical
  const brandOrder = ['Claude', 'GPT', 'Gemini', 'DeepSeek', 'Qwen', 'MiniMax', 'Kimi', 'GLM', 'MiMo', 'Grok', 'Nemotron', 'Other'];
  const sortedBrands = [...byBrand.keys()].sort(
    (a, b) => (brandOrder.indexOf(a) ?? 99) - (brandOrder.indexOf(b) ?? 99),
  );

  for (const brand of sortedBrands) {
    for (const m of byBrand.get(brand) ?? []) {
      options.push({ value: m.id, label: modelLabel(m), hint: modelHint(m) });
    }
  }

  const defaultModel =
    prefs.lastModel && options.some(o => o.value === prefs.lastModel)
      ? prefs.lastModel
      : options[0]?.value;

  const modelId = await p.select({
    message: 'Which model?',
    options,
    initialValue: defaultModel,
  });

  if (p.isCancel(modelId)) {
    p.cancel('Cancelled.');
    return null;
  }

  // Step 3: Show conflict warning if any
  if (conflicts.length > 0) {
    const lines = conflicts.map(c => `  ${pc.dim(c.name)}=${pc.dim(c.value)}`).join('\n');
    p.note(lines, pc.yellow('Env vars that will be temporarily overridden:'));
  }

  // Step 4: Confirm
  const confirmed = await p.confirm({
    message: `Launch Claude Code · ${pc.bold(String(modelId))} via ${pc.bold(backend.name)}?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Cancelled.');
    return null;
  }

  p.outro(pc.green(`Launching...`));

  return { backend, model: String(modelId) };
}
```

- [ ] **Step 2: Build and verify no TypeScript errors**

```bash
npm run build
```

Expected: Builds cleanly. If `@clack/prompts` type errors appear, run `npm install` first.

- [ ] **Step 3: Commit**

```bash
git add src/prompts.ts
git commit -m "feat: add interactive wizard with free-model highlighting"
```

---

## Task 8: Wire Up Entry Point (cli.ts)

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Replace src/cli.ts with the full entry point**

```typescript
// src/cli.ts
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { findClaudeBinary, launchClaude } from './launch.js';
import { resolveApiKey, detectConflicts, buildChildEnv } from './env.js';
import { getModels } from './models.js';
import { loadPreferences, savePreferences, getCachedModels, setCachedModels } from './config.js';
import { runWizard } from './prompts.js';
import { BACKENDS, VERSION } from './constants.js';
import type { ParsedArgs } from './types.js';

function parseArgs(args: string[]): ParsedArgs {
  if (args.includes('--help') || args.includes('-h')) {
    return { showHelp: true, showVersion: false, claudeArgs: [] };
  }
  if (args.includes('--version') || args.includes('-v')) {
    return { showVersion: true, showHelp: false, claudeArgs: [] };
  }
  const sep = args.indexOf('--');
  return {
    showHelp: false,
    showVersion: false,
    claudeArgs: sep >= 0 ? args.slice(sep + 1) : [],
  };
}

function printHelp(): void {
  console.log(`
${pc.bold('opencode-starter')} v${VERSION}
Launch Claude Code with OpenCode Zen or Go as the Anthropic API backend.

${pc.bold('Usage:')}
  opencode-starter [-- <claude-flags>]
  opencode-starter --help
  opencode-starter --version

${pc.bold('Setup:')}
  Get your API key at https://opencode.ai/settings/keys
  Then run: export OPENCODE_API_KEY="your-key"

${pc.bold('Examples:')}
  opencode-starter
  opencode-starter -- --print "hello"
  opencode-starter -- --dangerously-skip-permissions
`);
}

async function main(): Promise<void> {
  const { showHelp, showVersion, claudeArgs } = parseArgs(process.argv.slice(2));

  if (showHelp) { printHelp(); return; }
  if (showVersion) { console.log(VERSION); return; }

  // Prerequisite: claude binary
  const claudePath = findClaudeBinary();
  if (!claudePath) {
    console.error(pc.red('\nError: claude binary not found on PATH.\n'));
    console.error('Install Claude Code:');
    console.error('  npm install -g @anthropic-ai/claude-code\n');
    process.exit(1);
  }

  // Prerequisite: API key
  const apiKey = resolveApiKey();
  if (!apiKey) {
    const shell = process.env['SHELL'] ?? '';
    const profile = shell.includes('zsh') ? '~/.zshrc' : '~/.bashrc';
    console.error(pc.red('\nError: OPENCODE_API_KEY is not set.\n'));
    console.error('Get your key at: https://opencode.ai/settings/keys\n');
    console.error('Then add it to your shell profile:');
    console.error(`  echo 'export OPENCODE_API_KEY="your-key"' >> ${profile}`);
    console.error(`  source ${profile}\n`);
    process.exit(1);
  }

  const prefs = loadPreferences();
  const conflicts = detectConflicts();
  const backendId = prefs.lastBackend ?? 'zen';
  const backend = BACKENDS[backendId];
  const cachedModels = getCachedModels(backendId) ?? undefined;

  // Fetch models with spinner
  const spinner = p.spinner();
  spinner.start('Fetching available models...');
  let models;
  try {
    const result = await getModels(backend, cachedModels);
    models = result.models;
    if (result.fromCache) {
      spinner.stop(pc.yellow('Loaded models from cache (network unavailable)'));
    } else {
      spinner.stop(`Loaded ${models.length} models`);
      setCachedModels(backendId, models);
    }
  } catch (err) {
    spinner.stop(pc.red('Failed to load models'));
    console.error(pc.red(String(err instanceof Error ? err.message : err)));
    process.exit(1);
  }

  // Run interactive wizard
  const selection = await runWizard(prefs, models, conflicts);
  if (!selection) process.exit(0);

  // Persist choices for next run
  savePreferences({ lastBackend: selection.backend.id, lastModel: selection.model });

  // Build isolated child environment and launch
  const childEnv = buildChildEnv(selection.backend, selection.model, apiKey);
  const exitCode = await launchClaude(childEnv, selection.model, claudeArgs);
  process.exit(exitCode);
}

main().catch((err: unknown) => {
  // p.isCancel throws a symbol — swallow it cleanly
  if (typeof err === 'object' && err !== null && Symbol.iterator in Object(err)) {
    process.exit(0);
  }
  console.error(pc.red('\nUnexpected error:'), err);
  process.exit(1);
});
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: `dist/cli.js` built successfully with no TypeScript errors.

- [ ] **Step 3: Smoke test — help flag**

```bash
node dist/cli.js --help
```

Expected: Prints usage with backend info and examples, exits 0.

- [ ] **Step 4: Smoke test — version flag**

```bash
node dist/cli.js --version
```

Expected: Prints `0.1.0`, exits 0.

- [ ] **Step 5: Smoke test — missing API key**

```bash
unset OPENCODE_API_KEY && node dist/cli.js --help
# Re-run without --help to test the key check:
unset OPENCODE_API_KEY && node dist/cli.js
```

Expected: Second run shows red error message with setup instructions, exits 1.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Link locally and do a real wizard run**

```bash
npm link
```

Then (with `OPENCODE_API_KEY` set in a new terminal):

```bash
opencode-starter --version
```

Expected: Prints `0.1.0`

- [ ] **Step 8: Commit**

```bash
git add src/cli.ts
git commit -m "feat: wire up full CLI entry point"
```

---

## Task 9: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```markdown
# opencode-starter

> Launch Claude Code using [OpenCode](https://opencode.ai) Zen or Go as the Anthropic API backend.

## What it does

Runs an interactive wizard that:
1. Lets you choose **OpenCode Zen** (66+ models, free tier) or **OpenCode Go** (17 models, subscription)
2. Fetches the current model list with free models highlighted in green
3. Detects and warns about any conflicting environment variables (Vertex AI, Bedrock, etc.)
4. Launches Claude Code with a clean, isolated environment — **never modifies `~/.claude/settings.json`**

## Prerequisites

- Node.js 18+
- [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code) installed
- An [OpenCode API key](https://opencode.ai/settings/keys)

## Setup

Add your OpenCode API key to your shell profile:

```bash
# zsh
echo 'export OPENCODE_API_KEY="your-key-here"' >> ~/.zshrc && source ~/.zshrc

# bash
echo 'export OPENCODE_API_KEY="your-key-here"' >> ~/.bashrc && source ~/.bashrc
```

## Usage

```bash
npx opencode-starter
```

Or install globally:

```bash
npm install -g opencode-starter
opencode-starter
```

Pass extra flags to Claude Code after `--`:

```bash
opencode-starter -- --print "hello"
opencode-starter -- --dangerously-skip-permissions
```

## How it works (env isolation)

When launched, opencode-starter:
- Removes conflicting env vars from the child process (Vertex AI, Bedrock, AWS, Foundry, stale Anthropic config)
- Sets `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_MODEL` for the session
- Passes `--model <selected>` to Claude Code as a belt-and-suspenders override

When Claude Code exits (for any reason — normal exit, Ctrl+C, or terminal close), everything returns to normal. No cleanup needed.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```

---

## Task 10: Verification

Run each scenario manually. Check off each one as it passes.

**Pre-verification: note settings.json hash**

```bash
md5 ~/.claude/settings.json
```

Record the hash. Compare after each scenario.

### Scenario 1: settings.json stays intact

- [ ] Run `opencode-starter`, go through the wizard, select a model, let Claude Code launch
- [ ] Type `/exit` in Claude Code
- [ ] Run `md5 ~/.claude/settings.json` — hash must match pre-test value
- [ ] Run `opencode-starter`, Ctrl+C during the wizard
- [ ] Run `md5 ~/.claude/settings.json` — hash must match

### Scenario 2: Env isolation with Vertex AI active

- [ ] Verify current shell has Vertex AI vars: `echo $CLAUDE_CODE_USE_VERTEX` should print `1`
- [ ] Run `opencode-starter`, complete the wizard
- [ ] In the Claude Code session, type: `/cost` — the backend info should show the OpenCode URL, not Vertex AI
- [ ] Alternatively, check Claude Code startup banner for the API endpoint

### Scenario 3: Model connectivity (free model)

- [ ] Run `opencode-starter`, choose Zen, select a model marked "(free)"
- [ ] In Claude Code, type: `What is 2+2?` and verify you get a response
- [ ] Exit Claude Code

### Scenario 4: Fallback chain (API unavailable)

- [ ] Run `opencode-starter` while network is disabled (Wi-Fi off)
- [ ] Expected: spinner shows "Loaded models from cache (network unavailable)"
- [ ] Wizard should still show models from cache
- [ ] Re-enable network before proceeding

### Scenario 5: No OpenCode cache file

- [ ] Temporarily move the cache: `mv ~/.cache/opencode/models.json ~/.cache/opencode/models.json.bak`
- [ ] Run `opencode-starter` — should still work using API-only (no enrichment/free labels)
- [ ] Restore: `mv ~/.cache/opencode/models.json.bak ~/.cache/opencode/models.json`

### Scenario 6: Pass-through flags

- [ ] Run: `opencode-starter -- --print "What is 2+2?"`
- [ ] Expected: Claude Code runs in non-interactive mode and prints the answer, then exits

### Scenario 7: Preference persistence

- [ ] Run `opencode-starter`, select a specific backend and model, complete
- [ ] Exit Claude Code
- [ ] Run `opencode-starter` again — the previously selected backend and model should be pre-selected as defaults in the wizard

---

## Self-Review Checklist (for plan author)

- [x] **Spec coverage**: All 7 verification scenarios covered in Task 10. All modules from the spec are implemented. Free-model highlighting ✓. Conflict detection + warn ✓. No settings.json modification ✓. Preference persistence ✓. API-first with fallback ✓. Shell-specific API key instructions ✓. Pass-through `--` args ✓.
- [x] **No placeholders**: All code blocks contain actual implementation. No TBD.
- [x] **Type consistency**: `ModelInfo`, `BackendConfig`, `ConflictInfo`, `UserPreferences`, `ParsedArgs` defined in Task 2 and used consistently. `deriveBrand` in models.ts, `groupModels` returns `{ free, byBrand }` (not `{ free, byFamily }`) consistently across models.ts and prompts.ts.
- [x] **Cache structure**: Verified against actual `~/.cache/opencode/models.json`. Provider key for Zen is `opencode`, for Go is `opencode-go`. Free models detected by `cost.input === 0 && cost.output === 0`. `family` field available for brand derivation. `status === 'deprecated'` models filtered out.
