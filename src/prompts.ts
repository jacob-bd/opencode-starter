// src/prompts.ts
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { BackendConfig, ModelInfo, UserPreferences, ConflictInfo } from './types.js';
import { BACKENDS } from './constants.js';
import { groupModels } from './models.js';

function modelLabel(model: ModelInfo, showBackendBadge = false): string {
  if (model.isFree) {
    const tag = showBackendBadge ? '(free · Zen)' : '(free)';
    return pc.green(`${model.name} ${tag}`);
  }
  return model.name;
}

function modelHint(model: ModelInfo): string {
  const parts: string[] = [];
  if (!model.isAnthropicNative) parts.push('translated');
  if (!model.isFree) parts.push(`${model.brand} · ${model.id}`);
  else parts.push(model.id);
  return parts.join(' · ');
}

export async function askSubscriptionTier(): Promise<'free' | 'zen' | 'go' | 'both' | null> {
  const tier = await p.select<'free' | 'zen' | 'go' | 'both'>({
    message: 'What OpenCode subscription do you have?',
    options: [
      {
        value: 'free' as const,
        label: 'Free only',
        hint: 'Zen free models only — no subscription needed',
      },
      {
        value: 'zen' as const,
        label: 'Zen subscription',
        hint: 'All Zen models (paid + free)',
      },
      {
        value: 'go' as const,
        label: 'Go subscription',
        hint: 'All Go models',
      },
      {
        value: 'both' as const,
        label: 'Both (Zen + Go)',
        hint: 'All Go models + all Zen models — choose backend each launch',
      },
    ],
    initialValue: 'free' as const,
  });

  if (p.isCancel(tier)) {
    p.cancel('Cancelled.');
    return null;
  }

  return tier;
}

export async function runWizard(
  prefs: UserPreferences,
  modelsByBackend: { zen: ModelInfo[]; go: ModelInfo[] },
  conflicts: ConflictInfo[],
  tier: 'free' | 'zen' | 'go' | 'both',
): Promise<{ backend: BackendConfig; model: ModelInfo } | null> {
  p.intro(pc.bold('  OpenCode Starter'));

  // Backend selection — only shown for 'both' tier (user has two distinct backends to choose from).
  // free/zen → always Zen. go → mixed list (Zen free + Go paid), backend resolved per model.
  let selectorBackendId: 'zen' | 'go' | null = null;
  if (tier === 'both') {
    const backendId = await p.select<'zen' | 'go'>({
      message: 'Which backend?',
      options: [
        { value: 'zen' as const, label: 'OpenCode Zen', hint: '66+ models, free tier available' },
        { value: 'go' as const, label: 'OpenCode Go', hint: '17 models, subscription ($10/mo)' },
      ],
      initialValue: prefs.lastBackend ?? 'zen',
    });

    if (p.isCancel(backendId)) {
      p.cancel('Cancelled.');
      return null;
    }
    selectorBackendId = backendId;
  }

  // Determine which models to show based on tier
  // For 'go': Zen free models first (labeled "free · Zen"), then all Go paid models.
  // Backend for each model is its sourceBackend — resolved after the user picks.
  const showBackendBadge = tier === 'go';
  let models: ModelInfo[];
  if (tier === 'free') {
    models = modelsByBackend.zen.filter(m => m.isFree);
  } else if (tier === 'zen') {
    models = modelsByBackend.zen;
  } else if (tier === 'go') {
    const zenFree = modelsByBackend.zen.filter(m => m.isFree);
    models = [...zenFree, ...modelsByBackend.go];
  } else {
    // both: all models for the selected backend
    models = selectorBackendId === 'go' ? modelsByBackend.go : modelsByBackend.zen;
  }

  // Build model selector options
  const { free, byBrand } = groupModels(models);

  const options: Array<{ value: string; label: string; hint: string }> = [];

  for (const m of free) {
    options.push({ value: m.id, label: modelLabel(m, showBackendBadge), hint: modelHint(m) });
  }

  const brandOrder = ['Claude', 'GPT', 'Gemini', 'DeepSeek', 'Qwen', 'MiniMax', 'Kimi', 'GLM', 'MiMo', 'Grok', 'Nemotron', 'Other'];
  const sortedBrands = [...byBrand.keys()].sort(
    (a, b) => (brandOrder.indexOf(a) !== -1 ? brandOrder.indexOf(a) : 99) - (brandOrder.indexOf(b) !== -1 ? brandOrder.indexOf(b) : 99),
  );

  for (const brand of sortedBrands) {
    for (const m of byBrand.get(brand) ?? []) {
      options.push({ value: m.id, label: modelLabel(m), hint: modelHint(m) });
    }
  }

  if (options.length === 0) {
    p.cancel('No models available for this backend and subscription tier.');
    return null;
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

  const selectedModel = models.find(m => m.id === String(modelId))!;
  // Backend is always determined by which model was picked (critical for 'go' tier
  // where Zen free models and Go paid models coexist in the same list).
  const backend = BACKENDS[selectedModel.sourceBackend];

  // Show conflict warning if any
  if (conflicts.length > 0) {
    const lines = conflicts.map(c => `  ${pc.dim(c.name)}=${pc.dim(c.value)}`).join('\n');
    p.note(lines, pc.yellow('Env vars that will be temporarily overridden:'));
  }

  // Confirm
  const confirmed = await p.confirm({
    message: `Launch Claude Code · ${pc.bold(String(modelId))} via ${pc.bold(backend.name)}?`,
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Cancelled.');
    return null;
  }

  p.outro(pc.green('Launching...'));

  return { backend, model: selectedModel };
}
