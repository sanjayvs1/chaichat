import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";
import type {
  ChatMessage,
  ChatSession,
  Character,
  AIProvider,
  AIModel,
  ProviderStatus,
} from "../types/ollama";
import { dbService } from "../services/database";

// Import handler modules
import {
  clearChatHandler,
  loadSessionHandler,
  renameSessionHandler,
  deleteSessionHandler,
  duplicateSessionHandler,
  saveCurrentAsSessionHandler,
  getSessionsByDateGroup as getSessionsByDateGroupHandler,
  sortedSessionsHandler,
  getSessionParticipantIds,
} from "./sessionHandlers";

import {
  sendMessageHandler,
  searchChatsHandler,
  stopGenerationHandler,
} from "./messageHandlers";

import {
  loadCharactersHandler,
  createCharacterHandler,
  updateCharacterHandler,
  deleteCharacterHandler,
  duplicateCharacterHandler,
  addParticipantHandler,
} from "./characterHandlers";

import {
  checkConnectionsHandler,
  loadModelsHandler,
  handleModelChangeHandler,
  handleProviderChangeHandler,
} from "./modelHandlers";

import {
  exportSessionsHandler,
  importSessionsHandler,
  exportSessionHandler,
} from "./exportHandlers";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('ollama');
  const [isLoading, setIsLoading] = useState(false);
  const [isModelsLoading, setIsModelsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>({
    ollama: false,
    groq: false,
    lmstudio: false
  });
  // Extra global instructions prepended to every request
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  // Characters
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isCharactersLoading, setIsCharactersLoading] = useState(false);
  const [charactersError, setCharactersError] = useState<string | null>(null);
  // The character currently being spoken to (null = plain assistant mode)
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [isOllamaConnected, setIsOllamaConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [chatSummary, setChatSummary] = useState<string>("");
  // Flag to suppress autosave during session switches/initial load
  const isSwitchingSessionRef = useRef<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  // Loading state for session switches
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  // Track last used model per provider
  const [lastUsedModels, setLastUsedModels] = useState<{ollama?: string, groq?: string, lmstudio?: string}>({});

  // Always-fresh messages for async handlers (avoids stale closures during ask-all)
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // The active target character object
  const activeTarget = useMemo(
    () => characters.find((c) => c.id === activeTargetId),
    [characters, activeTargetId]
  );

  // Keep legacy selectedCharacter in sync with the active target so existing
  // handlers (edit/delete/duplicate) keep working.
  const [selectedCharacter, setSelectedCharacter] = useState<
    Character | undefined
  >();
  useEffect(() => {
    setSelectedCharacter(activeTarget);
  }, [activeTarget]);

  // Participants of the current chat (multi-character support)
  const currentSession = useMemo(
    () => sessions.find((s) => s.id === currentSessionId),
    [sessions, currentSessionId]
  );
  const participantIds = useMemo(
    () => getSessionParticipantIds(currentSession),
    [currentSession]
  );
  const participants = useMemo(
    () =>
      participantIds
        .map((id) => characters.find((c) => c.id === id))
        .filter((c): c is Character => !!c),
    [participantIds, characters]
  );

  // Cache for session message signatures to avoid repeated JSON.stringify calls
  const sessionSignatureCache = useRef<Map<string, string>>(new Map());

  // On mount, load sessions and set up initial session if needed
  useEffect(() => {
    const loadData = async () => {
      try {
        isSwitchingSessionRef.current = true;
        const dbSessions = await dbService.getAllSessions();
        setSessions(dbSessions);

        // Load characters from database
        const dbCharacters = await dbService.getAllCharacters();
        setCharacters(dbCharacters);

        if (dbSessions.length > 0) {
          const firstSession = dbSessions[0];
          setCurrentSessionId(firstSession.id);
          setMessages(firstSession.messages);

          // Restore provider and model from the first session
          if (firstSession.provider) {
            setSelectedProvider(firstSession.provider);
          }
          if (firstSession.selectedModel) {
            setSelectedModel(firstSession.selectedModel);
          }

          // Restore the active speaking target
          const ids = getSessionParticipantIds(firstSession);
          const lastAssistantChar = [...firstSession.messages]
            .reverse()
            .find((m) => m.role === 'assistant' && m.characterId)?.characterId;
          const restoredTargetId =
            lastAssistantChar ?? ids[0] ?? null;
          setActiveTargetId(restoredTargetId);
          const primaryChar = dbCharacters.find(
            (c) => c.id === (restoredTargetId ?? firstSession.characterId)
          );
          if (primaryChar) {
            console.log('Initial load: restoring character to:', primaryChar.name);
            setSelectedCharacter(primaryChar);
          }
        } else {
          // No sessions, create a new one with current provider/model
          const newSession: ChatSession = {
            id: crypto.randomUUID(),
            title: "New Conversation",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
            provider: selectedProvider,
            selectedModel: selectedModel,
          };
          await dbService.createSession(newSession);
          setSessions([newSession]);
          setCurrentSessionId(newSession.id);
          setMessages([]);
        }

        // Load system prompt from database
        const dbSystemPrompt = await dbService.getSetting("systemPrompt");
        if (dbSystemPrompt) {
          setSystemPrompt(dbSystemPrompt);
        }

        // Load last used models per provider
        const dbLastUsedModels = await dbService.getSetting("lastUsedModels");
        if (dbLastUsedModels) {
          try {
            const parsedModels = JSON.parse(dbLastUsedModels);
            setLastUsedModels(parsedModels);
          } catch (error) {
            console.error('Error parsing last used models:', error);
          }
        }
      } catch (error) {
        console.error("Failed to load data from database:", error);
      }

      setIsInitialized(true);
    };

    loadData().finally(() => {
      // Allow autosave again after initial load settles
      setTimeout(() => {
        isSwitchingSessionRef.current = false;
      }, 0);
    });
  }, []);

  // Autosave: update current session in DB whenever messages change
  useEffect(() => {
    if (!isInitialized || !currentSessionId) return;
    // Skip autosave while streaming or switching sessions
    if (isLoading || isSwitchingSessionRef.current) return;

    // Debounce the save operation to avoid too frequent database writes
    const saveTimeout = setTimeout(async () => {
      try {
        // Get the current session from database to get the latest state
        const currentSessionFromDb = await dbService.getSession(currentSessionId);
        if (!currentSessionFromDb) return;

        // Find new messages that need to be saved
        const existingMessageIds = new Set(currentSessionFromDb.messages.map(m => m.id));
        const newMessages = messages.filter(m => !existingMessageIds.has(m.id));

        // Find existing messages that might have been updated (e.g., during streaming)
        const updatedMessages = messages.filter(m => {
          const existingMessage = currentSessionFromDb.messages.find(em => em.id === m.id);
          return existingMessage && (
            existingMessage.content !== m.content ||
            existingMessage.timestamp.getTime() !== m.timestamp.getTime() ||
            existingMessage.characterId !== m.characterId ||
            existingMessage.targetId !== m.targetId
          );
        });

        let savedCount = 0;

        // Save new messages to the database
        if (newMessages.length > 0) {
          await dbService.addMessages(currentSessionId, newMessages);
          savedCount += newMessages.length;
        }

        // Update existing messages in the database
        for (const message of updatedMessages) {
          const existingMessage = currentSessionFromDb.messages.find(em => em.id === message.id);
          if (existingMessage) {
            const updates: Partial<ChatMessage> = {};
            if (existingMessage.content !== message.content) updates.content = message.content;
            if (existingMessage.timestamp.getTime() !== message.timestamp.getTime()) updates.timestamp = message.timestamp;
            if (existingMessage.characterId !== message.characterId) updates.characterId = message.characterId;
            if (existingMessage.targetId !== message.targetId) updates.targetId = message.targetId;

            if (Object.keys(updates).length > 0) {
              await dbService.updateMessage(message.id, updates);
              savedCount++;
            }
          }
        }

        if (savedCount > 0) {
          // Update session timestamp
          await dbService.updateSession(currentSessionId, {
            updatedAt: new Date().toISOString()
          });

          // Update local sessions state without triggering this effect again
          setSessions((prev) =>
            prev.map((s) =>
              s.id === currentSessionId
                ? { ...s, messages: [...messages], updatedAt: new Date().toISOString() }
                : s
            )
          );
        }
      } catch (error) {
        console.error("Failed to save messages to database:", error);
      }
    }, 1000); // Debounce to reduce DB writes during streaming

    return () => clearTimeout(saveTimeout);
  }, [messages, currentSessionId, isInitialized, isLoading]);

  // Persist system prompt when it changes (but not during initialization)
  useEffect(() => {
    if (isInitialized && systemPrompt !== undefined) {
      dbService.setSetting("systemPrompt", systemPrompt).catch((error) => {
        console.error("Failed to save system prompt to database:", error);
      });
    }
  }, [systemPrompt, isInitialized]);

  // Persist last used models when they change
  useEffect(() => {
    if (isInitialized && Object.keys(lastUsedModels).length > 0) {
      dbService.setSetting("lastUsedModels", JSON.stringify(lastUsedModels)).catch((error) => {
        console.error("Failed to save last used models to database:", error);
      });
    }
  }, [lastUsedModels, isInitialized]);

  // Load models on component mount, but only after initialization is complete
  useEffect(() => {
    if (isInitialized) {
      loadModels();
      checkConnections();
    }
  }, [isInitialized]);

  // Model and provider handlers
  const checkConnections = useCallback(async () => {
    await checkConnectionsHandler(setIsOllamaConnected, setProviderStatus);
  }, []);

  const loadModels = useCallback(async () => {
    await loadModelsHandler({
      setModels,
      setSelectedModel,
      setSelectedProvider,
      setIsModelsLoading,
      setError,
      setProviderStatus,
      setIsOllamaConnected,
      setLastUsedModels,
      selectedModel,
      selectedProvider,
      lastUsedModels,
      isInitialized
    });
  }, [selectedModel, lastUsedModels, isInitialized]);

  const handleModelChange = useCallback((model: string) => {
    handleModelChangeHandler(model, selectedProvider, setSelectedModel, setLastUsedModels);
  }, [selectedProvider]);

  const handleProviderChange = useCallback((newProvider: AIProvider) => {
    handleProviderChangeHandler(
      newProvider,
      lastUsedModels,
      models,
      setSelectedProvider,
      setSelectedModel
    );
  }, [lastUsedModels, models]);

  // Message handler
  const sendMessage = useCallback(
    async (content: string, options?: { askAll?: boolean }) => {
      const askAll = options?.askAll ?? false;
      const targets = askAll ? participants : activeTarget ? [activeTarget] : [];

      await sendMessageHandler(content, {
        selectedModel,
        selectedProvider,
        isLoading,
        currentSessionId,
        getMessages: () => messagesRef.current,
        systemPrompt,
        targets,
        providerStatus,
        setIsLoading,
        setError,
        setMessages,
        setSessions,
        abortControllerRef
      });
    },
    [
      selectedModel,
      selectedProvider,
      isLoading,
      systemPrompt,
      activeTarget,
      participants,
      currentSessionId,
      providerStatus,
    ]
  );

  const searchChats = useCallback(
    async (query: string) => {
      return await searchChatsHandler(query, messages, sessions);
    },
    [messages, sessions]
  );

  const stopGeneration = useCallback(() => {
    stopGenerationHandler(abortControllerRef);
  }, []);

  // Session handlers
  const clearChat = useCallback(async () => {
    await clearChatHandler({
      sessions,
      setSessions,
      setCurrentSessionId,
      setMessages,
      setChatSummary,
      setError,
      selectedCharacter,
      selectedProvider,
      selectedModel,
      currentSessionId,
      messages,
      characters,
      isSwitchingSessionRef,
      sessionSignatureCache
    });
    // Focus the first carried-over participant, if any
    const previousSession = sessions.find((s) => s.id === currentSessionId);
    const carried = previousSession ? getSessionParticipantIds(previousSession) : [];
    setActiveTargetId(carried[0] ?? null);
  }, [selectedCharacter, selectedProvider, selectedModel, sessions, currentSessionId, messages, characters]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      // Skip if already loading this session
      if (isLoadingSession || sessionId === currentSessionId) return;
      
      setIsLoadingSession(true);
      try {
        await loadSessionHandler(
          sessionId,
          {
            sessions,
            setSessions,
            setCurrentSessionId,
            setMessages,
            setChatSummary,
            setError,
            selectedCharacter,
            selectedProvider,
            selectedModel,
            currentSessionId,
            messages,
            characters,
            isSwitchingSessionRef,
            sessionSignatureCache,
            setActiveTargetId
          },
          characters,
          setSelectedProvider,
          setSelectedModel,
          setSelectedCharacter,
          startTransition
        );
      } finally {
        setIsLoadingSession(false);
      }
    },
    [sessions, characters, selectedCharacter, selectedProvider, selectedModel, currentSessionId, messages, isLoadingSession]
  );

  const renameSession = useCallback(
    async (sessionId: string, newTitle: string) => {
      await renameSessionHandler(sessionId, newTitle, setSessions);
    },
    []
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSessionHandler(sessionId, {
        sessions,
        setSessions,
        setCurrentSessionId,
        setMessages,
        setChatSummary,
        setError,
        selectedCharacter,
        selectedProvider,
        selectedModel,
        currentSessionId,
        messages,
        characters,
        isSwitchingSessionRef,
        sessionSignatureCache
      });
    },
    [sessions, selectedCharacter, selectedProvider, selectedModel, currentSessionId, messages, characters]
  );

  const duplicateSession = useCallback(
    async (sessionId: string) => {
      await duplicateSessionHandler(sessionId, sessions, setSessions);
    },
    [sessions]
  );

  const getCurrentSessionId = useCallback(
    () => currentSessionId,
    [currentSessionId]
  );

  const getCurrentSession = useCallback(() => {
    return currentSessionId
      ? sessions.find((s) => s.id === currentSessionId) || null
      : null;
  }, [currentSessionId, sessions]);

  const getSessionsByDateGroup = useCallback(() => {
    return getSessionsByDateGroupHandler(sessions);
  }, [sessions]);

  const sortedSessions = useCallback(
    (sortBy: "date" | "name" | "length" = "date") => {
      return sortedSessionsHandler(sessions, sortBy);
    },
    [sessions]
  );

  const saveCurrentAsSession = useCallback(
    async (title?: string) => {
      return await saveCurrentAsSessionHandler(
        currentSessionId,
        selectedCharacter,
        setSessions,
        title
      );
    },
    [currentSessionId, selectedCharacter]
  );

  // Export/Import handlers
  const exportSessions = useCallback(async () => {
    await exportSessionsHandler(messages);
  }, [messages]);

  const importSessions = useCallback(
    async (file?: File) => {
      return await importSessionsHandler(file, messages, setMessages, setSessions);
    },
    [messages]
  );

  const exportSession = useCallback(
    (sessionId: string) => {
      exportSessionHandler(sessionId, sessions);
    },
    [sessions]
  );

  // Character handlers
  const loadCharacters = useCallback(async () => {
    const loaded = await loadCharactersHandler({ setCharacters, setIsCharactersLoading, setCharactersError });
    setCharacters(loaded);
  }, []);

  const createCharacter = useCallback(async (character: Character) => {
    return await createCharacterHandler(character, setCharacters, setCharactersError);
  }, []);

  const updateCharacter = useCallback(
    async (characterId: string, updates: Partial<Character>) => {
      await updateCharacterHandler(characterId, updates, {
        setCharacters,
        setIsCharactersLoading,
        setCharactersError,
        setSelectedCharacter,
        selectedCharacter
      });
    },
    [selectedCharacter]
  );

  const deleteCharacter = useCallback(
    async (characterId: string) => {
      await deleteCharacterHandler(characterId, {
        setCharacters,
        setIsCharactersLoading,
        setCharactersError,
        setSelectedCharacter,
        selectedCharacter
      });
      // Drop them from the current chat if they were participating
      if (currentSessionId) {
        const nextIds = participantIds.filter((id) => id !== characterId);
        await dbService.updateSession(currentSessionId, { participantIds: nextIds }).catch(() => {});
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? { ...s, participantIds: nextIds.length > 0 ? nextIds : undefined }
              : s
          )
        );
        if (activeTargetId === characterId) {
          setActiveTargetId(nextIds[0] ?? null);
        }
      }
    },
    [selectedCharacter, currentSessionId, participantIds, activeTargetId]
  );

  const duplicateCharacter = useCallback(async (character: Character) => {
    return await duplicateCharacterHandler(character, setCharacters, setCharactersError);
  }, []);

  // Selecting a character adds/joins them into the chat and focuses them.
  const selectCharacter = useCallback(async (character: Character | undefined) => {
    await addParticipantHandler(
      character,
      currentSessionId,
      sessions,
      messages,
      setActiveTargetId,
      setSessions,
      setMessages
    );
  }, [currentSessionId, sessions, messages]);

  // Remove a character from the current chat (their history stays visible)
  const removeParticipant = useCallback(
    async (characterId: string) => {
      if (!currentSessionId) return;
      const nextIds = participantIds.filter((id) => id !== characterId);
      try {
        await dbService.updateSession(currentSessionId, { participantIds: nextIds });
      } catch (err) {
        console.error("Failed to persist participants:", err);
      }
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, participantIds: nextIds.length > 0 ? nextIds : undefined }
            : s
        )
      );
      if (activeTargetId === characterId) {
        setActiveTargetId(nextIds[nextIds.length - 1] ?? null);
      }
    },
    [currentSessionId, participantIds, activeTargetId]
  );

  const setActiveTarget = useCallback((character: Character | undefined) => {
    setActiveTargetId(character?.id ?? null);
  }, []);

  return {
    messages,
    sessions,
    models,
    selectedModel,
    setSelectedModel: handleModelChange,
    selectedProvider,
    setSelectedProvider,
    handleProviderChange,
    isLoading,
    isModelsLoading,
    error,
    isOllamaConnected,
    providerStatus,
    sendMessage,
    clearChat,
    loadSession,
    stopGeneration,
    loadModels,
    checkConnections,
    systemPrompt,
    setSystemPrompt,
    searchChats,
    renameSession,
    deleteSession,
    duplicateSession,
    getCurrentSessionId,
    getSessionsByDateGroup,
    sortedSessions,
    exportSessions,
    importSessions,
    exportSession,
    saveCurrentAsSession,
    getCurrentSession,
    // Character-related functions
    characters,
    selectedCharacter,
    isCharactersLoading,
    charactersError,
    loadCharacters,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    duplicateCharacter,
    selectCharacter,
    chatSummary,
    setChatSummary,
    isLoadingSession,
    // Multi-character chat
    participants,
    activeTarget,
    activeTargetId,
    setActiveTarget,
    removeParticipant,
  };
}
