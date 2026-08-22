import type { Character } from '../types/ollama'

export const DEFAULT_CHARACTERS: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: "Assistant",
    tagline: "A helpful AI assistant",
    description: "A helpful AI assistant ready to help with any questions",
    systemPrompt: "You are Assistant, a helpful, friendly and knowledgeable AI assistant. Answer questions clearly and accurately. Use markdown formatting when helpful.",
    greeting: "Hi! I'm your assistant. What can I help you with today?",
    memoryEnabled: true,
    isDefault: true,
  },
]
