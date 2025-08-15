import type { Character, ChatSession, ChatMessage, AIProvider } from "../types/ollama";
import { dbService } from "../services/database";
import { GroqService } from "../services/groq";

export interface CharacterHandlerParams {
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  setIsCharactersLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCharactersError: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedCharacter: React.Dispatch<React.SetStateAction<Character | undefined>>;
  selectedCharacter?: Character;
}

export const loadCharactersHandler = async (
  params: Pick<CharacterHandlerParams, 'setCharacters' | 'setIsCharactersLoading' | 'setCharactersError'>
) => {
  const { setCharacters, setIsCharactersLoading, setCharactersError } = params;
  
  setIsCharactersLoading(true);
  setCharactersError(null);
  try {
    const dbCharacters = await dbService.getAllCharacters();
    setCharacters(dbCharacters);
  } catch (error) {
    setCharactersError(
      error instanceof Error ? error.message : "Failed to load characters"
    );
  } finally {
    setIsCharactersLoading(false);
  }
};

export const createCharacterHandler = async (
  character: Character,
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>,
  setCharactersError: React.Dispatch<React.SetStateAction<string | null>>
) => {
  try {
    await dbService.createCharacter(character);
    setCharacters((prev) => [character, ...prev]);
    return character.id;
  } catch (error) {
    setCharactersError(
      error instanceof Error ? error.message : "Failed to create character"
    );
    throw error;
  }
};

export const updateCharacterHandler = async (
  characterId: string,
  updates: Partial<Character>,
  params: CharacterHandlerParams
) => {
  const { setCharacters, setCharactersError, setSelectedCharacter, selectedCharacter } = params;
  
  try {
    await dbService.updateCharacter(characterId, updates);

    setCharacters((prev) =>
      prev.map((char) =>
        char.id === characterId
          ? { ...char, ...updates, updatedAt: new Date().toISOString() }
          : char
      )
    );
    // Update selected character if it's the one being updated
    if (selectedCharacter?.id === characterId) {
      setSelectedCharacter((prev) =>
        prev
          ? { ...prev, ...updates, updatedAt: new Date().toISOString() }
          : undefined
      );
    }
  } catch (error) {
    setCharactersError(
      error instanceof Error ? error.message : "Failed to update character"
    );
    throw error;
  }
};

export const deleteCharacterHandler = async (
  characterId: string,
  params: CharacterHandlerParams
) => {
  const { setCharacters, setCharactersError, setSelectedCharacter, selectedCharacter } = params;
  
  try {
    await dbService.deleteCharacter(characterId);

    setCharacters((prev) => prev.filter((char) => char.id !== characterId));
    // Clear selected character if it's the one being deleted
    if (selectedCharacter?.id === characterId) {
      setSelectedCharacter(undefined);
    }
  } catch (error) {
    setCharactersError(
      error instanceof Error ? error.message : "Failed to delete character"
    );
    throw error;
  }
};

export const duplicateCharacterHandler = async (
  character: Character,
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>,
  setCharactersError: React.Dispatch<React.SetStateAction<string | null>>
) => {
  const duplicatedCharacter: Character = {
    ...character,
    id: crypto.randomUUID(),
    name: `${character.name} (Copy)`,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await dbService.createCharacter(duplicatedCharacter);
    setCharacters((prev) => [duplicatedCharacter, ...prev]);
    return duplicatedCharacter.id;
  } catch (error) {
    setCharactersError(
      error instanceof Error ? error.message : "Failed to duplicate character"
    );
    throw error;
  }
};

export const selectCharacterHandler = async (
  character: Character | undefined,
  currentSessionId: string | null,
  sessions: ChatSession[],
  messages: ChatMessage[],
  selectedProvider: AIProvider,
  selectedModel: string,
  setSelectedCharacter: React.Dispatch<React.SetStateAction<Character | undefined>>,
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>,
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setChatSummary: React.Dispatch<React.SetStateAction<string>>
) => {
  setSelectedCharacter(character);
  if (!currentSessionId) return;

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const currentCharacterId = currentSession?.characterId;
  const nextCharacterId = character?.id;

  // If the current session already has messages and character is changing,
  // start a fresh session bound to the newly selected character.
  if (messages.length > 0 && currentCharacterId !== nextCharacterId) {
    // Clear chat summary when changing characters to prevent context bleeding
    setChatSummary("");
    
    // Reset Groq client to ensure clean state
    GroqService.resetClient();
    
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: "New Conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      characterId: nextCharacterId,
      provider: selectedProvider,
      selectedModel: selectedModel,
    };
    try {
      await dbService.createSession(newSession);
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      setMessages([]);
    } catch (err) {
      console.error("Failed to create new session on character change:", err);
    }
    return;
  }

  // Otherwise, bind current session to this character
  try {
    await dbService.updateSession(currentSessionId, { characterId: nextCharacterId });
    setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, characterId: nextCharacterId } : s));
  } catch (err) {
    console.error('Failed to persist character selection to session:', err);
  }
};
