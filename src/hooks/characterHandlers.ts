import type { Character, ChatSession, ChatMessage } from "../types/ollama";
import { dbService } from "../services/database";

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
    return dbCharacters;
  } catch (error) {
    setCharactersError(
      error instanceof Error ? error.message : "Failed to load characters"
    );
    return [];
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

/**
 * Adds a character into the current chat as a participant and makes them the
 * active speaking target. If they have a greeting and haven't spoken yet in
 * this chat, their opening line is added immediately.
 */
export const addParticipantHandler = async (
  character: Character | undefined,
  currentSessionId: string | null,
  sessions: ChatSession[],
  messages: ChatMessage[],
  setActiveTargetId: React.Dispatch<React.SetStateAction<string | null>>,
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
) => {
  if (!character) return;

  // Always focus the chosen character
  setActiveTargetId(character.id);

  if (!currentSessionId) return;

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const participants =
    currentSession?.participantIds ??
    (currentSession?.characterId ? [currentSession.characterId] : []);

  const alreadyInChat = participants.includes(character.id);

  // Add greeting when the character joins a conversation they haven't spoken in
  if (character.greeting && !messages.some((m) => m.characterId === character.id)) {
    const greetingMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: character.greeting,
      timestamp: new Date(),
      characterId: character.id,
    };
    setMessages((prev) => [...prev, greetingMessage]);
    if (currentSession && !alreadyInChat) {
      try {
        await dbService.addMessages(currentSessionId, [greetingMessage]);
      } catch (err) {
        console.error("Failed to persist greeting:", err);
      }
    }
  }

  if (!alreadyInChat) {
    const nextParticipants = [...participants, character.id];
    if (currentSession) {
      try {
        await dbService.updateSession(currentSessionId, {
          participantIds: nextParticipants,
          characterId: currentSession.characterId ?? character.id,
        });
      } catch (err) {
        console.error("Failed to persist participants:", err);
      }
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                participantIds: nextParticipants,
                characterId: s.characterId ?? character.id,
              }
            : s
        )
      );
    }
  }
};
