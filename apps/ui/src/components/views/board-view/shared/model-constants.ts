import type { ModelAlias } from '@/store/app-store';
import type { ModelProvider, ThinkingLevel, ReasoningEffort } from '@dmaker/types';
import {
  CURSOR_MODEL_MAP,
  CODEX_MODEL_MAP,
  OPENCODE_MODELS as OPENCODE_MODEL_CONFIGS,
} from '@dmaker/types';
import { Brain, Zap, Scale, Cpu, Rocket, Sparkles } from 'lucide-react';
import {
  AnthropicIcon,
  CursorIcon,
  OpenAIIcon,
  OpenCodeIcon,
  GcpIcon,
} from '@/components/ui/provider-icon';

export type ModelOption = {
  id: string; // Claude models use ModelAlias, Cursor models use "cursor-{id}"
  label: string;
  description: string;
  badge?: string;
  provider: ModelProvider;
  hasThinking?: boolean;
};

export const CLAUDE_MODELS: ModelOption[] = [
  {
    id: 'haiku',
    label: 'Claude Haiku',
    description: 'Fast and efficient for simple tasks.',
    badge: 'Speed',
    provider: 'claude',
  },
  {
    id: 'sonnet',
    label: 'Claude Sonnet',
    description: 'Balanced performance with strong reasoning.',
    badge: 'Balanced',
    provider: 'claude',
  },
  {
    id: 'opus',
    label: 'Claude Opus',
    description: 'Most capable model for complex work.',
    badge: 'Premium',
    provider: 'claude',
  },
];

/**
 * Cursor models derived from CURSOR_MODEL_MAP
 * ID is prefixed with "cursor-" for ProviderFactory routing (if not already prefixed)
 */
export const CURSOR_MODELS: ModelOption[] = Object.entries(CURSOR_MODEL_MAP).map(
  ([id, config]) => ({
    id: id.startsWith('cursor-') ? id : `cursor-${id}`,
    label: config.label,
    description: config.description,
    provider: 'cursor' as ModelProvider,
    hasThinking: config.hasThinking,
  })
);

/**
 * Codex/OpenAI models
 * Official models from https://developers.openai.com/codex/models/
 */
export const CODEX_MODELS: ModelOption[] = [
  {
    id: CODEX_MODEL_MAP.gpt52Codex,
    label: 'GPT-5.2-Codex',
    description: 'Most advanced agentic coding model for complex software engineering.',
    badge: 'Premium',
    provider: 'codex',
    hasThinking: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt51CodexMax,
    label: 'GPT-5.1-Codex-Max',
    description: 'Optimized for long-horizon, agentic coding tasks in Codex.',
    badge: 'Premium',
    provider: 'codex',
    hasThinking: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt51CodexMini,
    label: 'GPT-5.1-Codex-Mini',
    description: 'Smaller, more cost-effective version for faster workflows.',
    badge: 'Speed',
    provider: 'codex',
    hasThinking: false,
  },
  {
    id: CODEX_MODEL_MAP.gpt52,
    label: 'GPT-5.2',
    description: 'Best general agentic model for tasks across industries and domains.',
    badge: 'Balanced',
    provider: 'codex',
    hasThinking: true,
  },
  {
    id: CODEX_MODEL_MAP.gpt51,
    label: 'GPT-5.1',
    description: 'Great for coding and agentic tasks across domains.',
    badge: 'Balanced',
    provider: 'codex',
    hasThinking: true,
  },
];

/**
 * OpenCode models derived from OPENCODE_MODEL_CONFIGS
 */
export const OPENCODE_MODELS: ModelOption[] = OPENCODE_MODEL_CONFIGS.map((config) => ({
  id: config.id,
  label: config.label,
  description: config.description,
  badge: config.tier === 'free' ? 'Free' : config.tier === 'premium' ? 'Premium' : undefined,
  provider: config.provider as ModelProvider,
}));

/**
 * GCP/Vertex AI Gemini models
 */
export const GCP_MODELS: ModelOption[] = [
  {
    id: 'gcp-gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Most capable Gemini model for complex tasks.',
    badge: 'Premium',
    provider: 'gcp',
  },
  {
    id: 'gcp-gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Fast and efficient with strong reasoning.',
    badge: 'Balanced',
    provider: 'gcp',
  },
  {
    id: 'gcp-gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    description: 'Quick responses for simpler tasks.',
    badge: 'Speed',
    provider: 'gcp',
  },
  {
    id: 'gcp-gemini-1.5-pro',
    label: 'Gemini 1.5 Pro',
    description: 'Large context window for complex analysis.',
    badge: 'Balanced',
    provider: 'gcp',
  },
  {
    id: 'gcp-gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    description: 'Lightweight and fast for simple queries.',
    badge: 'Speed',
    provider: 'gcp',
  },
];

/**
 * All available models (Claude + Cursor + Codex + OpenCode + GCP)
 */
export const ALL_MODELS: ModelOption[] = [
  ...CLAUDE_MODELS,
  ...CURSOR_MODELS,
  ...CODEX_MODELS,
  ...OPENCODE_MODELS,
  ...GCP_MODELS,
];

export const THINKING_LEVELS: ThinkingLevel[] = ['none', 'low', 'medium', 'high', 'ultrathink'];

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  ultrathink: 'Ultra',
};

/**
 * Reasoning effort levels for Codex/OpenAI models
 * All models support reasoning effort levels
 */
export const REASONING_EFFORT_LEVELS: ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Min',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  xhigh: 'XHigh',
};

// Profile icon mapping
export const PROFILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
  Anthropic: AnthropicIcon,
  Cursor: CursorIcon,
  Codex: OpenAIIcon,
  OpenCode: OpenCodeIcon,
};
