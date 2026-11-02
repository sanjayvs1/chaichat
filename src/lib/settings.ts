import type { AppSettings, GenerationParams } from '../types/chat'

export const DEFAULT_SUMMARY_PROMPT =
  'Summarize the story so far. Keep names, relationships, decisions, promises and where everyone is now. ' +
  'Write plain past-tense prose, without commentary.'

export const SAMPLER_PRESETS: Array<{ name: string; hint: string; params: Partial<GenerationParams> }> = [
  { name: 'Precise', hint: 'Consistent, stays on task', params: { temperature: 0.4, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0 } },
  { name: 'Balanced', hint: 'A good default', params: { temperature: 0.8, topP: 1, frequencyPenalty: 0, presencePenalty: 0 } },
  { name: 'Creative', hint: 'Surprising, less repetitive', params: { temperature: 1.05, topP: 0.95, frequencyPenalty: 0.2, presencePenalty: 0.2 } },
]

export const DEFAULT_SETTINGS: AppSettings = {
  generation: {
    temperature: 0.8,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxTokens: 0,
    contextTokens: 8192,
    stop: [],
    seed: -1,
  },
  summary: {
    enabled: false,
    everyMessages: 20,
    maxWords: 200,
    prompt: DEFAULT_SUMMARY_PROMPT,
  },
  vectors: {
    enabled: false,
    connectionId: '',
    model: '',
    scope: 'chat',
    topK: 4,
  },
  groupContext: 'separate',
  personaId: null,
  chatFont: 'serif',
  accent: 'chai',
  ambience: true,
}

// Saved settings may predate newer fields
export function parseSettings(raw: string | null): AppSettings {
  if (!raw) return DEFAULT_SETTINGS
  try {
    const saved = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      generation: { ...DEFAULT_SETTINGS.generation, ...saved.generation },
      summary: { ...DEFAULT_SETTINGS.summary, ...saved.summary },
      vectors: { ...DEFAULT_SETTINGS.vectors, ...saved.vectors },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}
