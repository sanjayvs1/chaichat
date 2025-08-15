import { useState, useEffect, useCallback, useRef, startTransition } from "react";
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
  selectCharacterHandler,
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
    groq: false
  });
  // System prompt (prepended as first assistant message when chatting)
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  // Character state
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<
    Character | undefined
  >();
  const [isCharactersLoading, setIsCharactersLoading] = useState(false);
  const [charactersError, setCharactersError] = useState<string | null>(null);
  const [isOllamaConnected, setIsOllamaConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [chatSummary, setChatSummary] = useState<string>("");
  // Flag to suppress autosave during session switches/initial load
  const isSwitchingSessionRef = useRef<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // Track last used model per provider
  const [lastUsedModels, setLastUsedModels] = useState<{ollama?: string, groq?: string}>({});

  // Cache for session message signatures to avoid repeated JSON.stringify calls
  const sessionSignatureCache = useRef<Map<string, string>>(new Map());

  // On mount, load sessions and set up initial session if needed
  useEffect(() => {
    const loadData = async () => {
      try {
        isSwitchingSessionRef.current = true;
        const dbSessions = await dbService.getAllSessions();
        console.log('Loaded sessions from DB:', dbSessions.map(s => ({ 
          id: s.id, 
          title: s.title, 
          provider: s.provider, 
          selectedModel: s.selectedModel,
          characterId: s.characterId 
        })));
        setSessions(dbSessions);
        if (dbSessions.length > 0) {
          const firstSession = dbSessions[0];
          setCurrentSessionId(firstSession.id);
          setMessages(firstSession.messages);
          
          // Restore provider and model from the first session
          if (firstSession.provider) {
            console.log('Initial load: restoring provider to:', firstSession.provider);
            setSelectedProvider(firstSession.provider);
          }
          if (firstSession.selectedModel) {
            console.log('Initial load: restoring model to:', firstSession.selectedModel);
            setSelectedModel(firstSession.selectedModel);
          }
        } else {
          // No sessions, create a new one
          const newSession: ChatSession = {
            id: crypto.randomUUID(),
            title: "New Conversation",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
            characterId: undefined,
            provider: undefined,
            selectedModel: undefined,
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
            console.log('Loaded last used models:', parsedModels);
          } catch (error) {
            console.error('Error parsing last used models:', error);
          }
        }

        // Load characters from database
        const dbCharacters = await dbService.getAllCharacters();
        setCharacters(dbCharacters);
        
        // Restore character from the first session if it exists
        if (dbSessions.length > 0 && dbSessions[0].characterId) {
          const foundChar = dbCharacters.find((c) => c.id === dbSessions[0].characterId);
          if (foundChar) {
            console.log('Initial load: restoring character to:', foundChar.name);
            setSelectedCharacter(foundChar);
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
        // Get the current session to compare messages
        const currentSession = sessions.find(s => s.id === currentSessionId);
        if (!currentSession) return;
        
        // Find new messages that need to be saved
        const existingMessageIds = new Set(currentSession.messages.map(m => m.id));
        const newMessages = messages.filter(m => !existingMessageIds.has(m.id));
        
        // Find existing messages that might have been updated (e.g., during streaming)
        const updatedMessages = messages.filter(m => {
          const existingMessage = currentSession.messages.find(em => em.id === m.id);
          return existingMessage && (
            existingMessage.content !== m.content ||
            existingMessage.timestamp.getTime() !== m.timestamp.getTime() ||
            existingMessage.characterId !== m.characterId
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
          const existingMessage = currentSession.messages.find(em => em.id === message.id);
          if (existingMessage) {
            const updates: Partial<ChatMessage> = {};
            if (existingMessage.content !== message.content) updates.content = message.content;
            if (existingMessage.timestamp.getTime() !== message.timestamp.getTime()) updates.timestamp = message.timestamp;
            if (existingMessage.characterId !== message.characterId) updates.characterId = message.characterId;
            
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
          
          // Update local sessions state
          setSessions((prev) =>
            prev.map((s) =>
              s.id === currentSessionId
                ? { ...s, updatedAt: new Date().toISOString() }
                : s
            )
          );
          
          console.log(`Saved ${savedCount} messages (${newMessages.length} new, ${updatedMessages.length} updated) to session ${currentSessionId}`);
        }
      } catch (error) {
        console.error("Failed to save messages to database:", error);
        // fallback: update local state only
        setSessions((prev) =>
          prev.map((s) => (s.id === currentSessionId ? { ...s } : s))
        );
      }
    }, 500); // 500ms debounce
    
    return () => clearTimeout(saveTimeout);
  }, [messages, currentSessionId, isInitialized, sessions, isLoading]);

  // Persist system prompt when it changes (but not during initialization)
  useEffect(() => {
    if (isInitialized && systemPrompt !== undefined) {
      dbService.setSetting("systemPrompt", systemPrompt).catch((error) => {
        console.error("Failed to save system prompt to database:", error);
        // Fallback to localStorage
        localStorage.setItem("systemPrompt", systemPrompt);
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

  // Message handlers
  const sendMessage = useCallback(
    async (content: string) => {
      await sendMessageHandler(content, {
        selectedModel,
        selectedProvider,
        isLoading,
        currentSessionId,
        messages,
        systemPrompt,
        selectedCharacter,
        chatSummary,
        providerStatus,
        setIsLoading,
        setError,
        setMessages,
        setChatSummary,
        setSessions,
        abortControllerRef
      });
    },
    [
      selectedModel,
      selectedProvider,
      isLoading,
      systemPrompt,
      messages,
      selectedCharacter,
      chatSummary,
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
      isSwitchingSessionRef,
      sessionSignatureCache
    });
  }, [selectedCharacter, selectedProvider, selectedModel, sessions, currentSessionId, messages]);

  const loadSession = useCallback(
    async (sessionId: string) => {
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
          isSwitchingSessionRef,
          sessionSignatureCache
        },
        characters,
        setSelectedProvider,
        setSelectedModel,
        setSelectedCharacter,
        startTransition
      );
    },
    [sessions, characters, selectedCharacter, selectedProvider, selectedModel, currentSessionId, messages]
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
        isSwitchingSessionRef,
        sessionSignatureCache
      });
    },
    [sessions, selectedCharacter, selectedProvider, selectedModel, currentSessionId, messages]
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
    await loadCharactersHandler({ setCharacters, setIsCharactersLoading, setCharactersError });
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
    },
    [selectedCharacter]
  );

  const duplicateCharacter = useCallback(async (character: Character) => {
    return await duplicateCharacterHandler(character, setCharacters, setCharactersError);
  }, []);

  const selectCharacter = useCallback(async (character: Character | undefined) => {
    await selectCharacterHandler(
      character,
      currentSessionId,
      sessions,
      messages,
      selectedProvider,
      selectedModel,
      setSelectedCharacter,
      setSessions,
      setCurrentSessionId,
      setMessages,
      setChatSummary
    );
  }, [currentSessionId, sessions, messages, selectedProvider, selectedModel]);

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
  };
}