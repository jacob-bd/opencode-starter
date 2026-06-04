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
