import type { Character } from '../types/ollama'

export const DEFAULT_CHARACTERS: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: "Assistant",
    description: "A helpful AI assistant ready to help with any questions",
    isDefault: true,
  },
  {
    name: "Coding Mentor",
    description: "An expert programmer who helps with coding questions and best practices",
    isDefault: false,
  },
  {
    name: "Creative Writer",
    description: "A creative writing assistant for stories, poems, and imaginative content",
    isDefault: false,
  },
] 