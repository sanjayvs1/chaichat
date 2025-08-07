import { useState, useEffect, useCallback, useRef, startTransition } from "react";
import type {
  ChatMessage,
  OllamaModel,
  ChatSession,
  Character,
} from "../types/ollama";
import { OllamaService } from "../services/ollama";
import { dbService } from "../services/database";



export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isModelsLoading, setIsModelsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  // removed unused persistTimeout
  const [chatSummary, setChatSummary] = useState<string>("");
  // Flag to suppress autosave during session switches/initial load
  const isSwitchingSessionRef = useRef<boolean>(false);

  // Track the last auto-saved message count to avoid duplicates
  // removed unused lastAutoSavedCountRef
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Add this after useState declarations
  // Remove deduplication/signature logic and sessionSignatureSet

  // On mount, load sessions and set up initial session if needed
  useEffect(() => {
    const loadData = async () => {
      try {
        isSwitchingSessionRef.current = true;
        const dbSessions = await dbService.getAllSessions();
        setSessions(dbSessions);
        if (dbSessions.length > 0) {
          setCurrentSessionId(dbSessions[0].id);
          setMessages(dbSessions[0].messages);
        } else {
          // No sessions, create a new one
          const newSession: ChatSession = {
            id: crypto.randomUUID(),
            title: "New Conversation",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
            characterId: undefined,
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

        // Load characters from database
        const dbCharacters = await dbService.getAllCharacters();
        setCharacters(dbCharacters);
      } catch (error) {
        console.error("Failed to load data from database:", error);
        // Fall through to localStorage fallback
      }

      // Note: localStorage fallback removed - all data is now stored in database

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

  // Load models on component mount
  useEffect(() => {
    loadModels();
    checkOllamaConnection();
  }, []);

  const checkOllamaConnection = async () => {
    const isConnected = await OllamaService.checkHealth();
    setIsOllamaConnected(isConnected);
  };

  const loadModels = async () => {
    setIsModelsLoading(true);
    setError(null);
    try {
      const response = await OllamaService.getModels();
      setModels(response.models);
      setIsOllamaConnected(true);

      // Auto-select gemma2:1b if available, otherwise select first model
      if (response.models.length > 0) {
        const gemmaModel = response.models.find((m) => m.name === "gemma2:1b");
        if (gemmaModel) {
          setSelectedModel("gemma2:1b");
        } else {
          setSelectedModel(response.models[0].name);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
      setIsOllamaConnected(false);
    } finally {
      setIsModelsLoading(false);
    }
  };

  // When sending a message, always add to current session
  const sendMessage = useCallback(
    async (content: string) => {
      if (!selectedModel || isLoading || !currentSessionId) return;

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        characterId: selectedCharacter?.id,
      };

      // Get current messages at the time of sending to avoid stale closures
      const currentMessages = messages;

      // Set loading state and add messages immediately
      setIsLoading(true);
      setError(null);
      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      // Always update updatedAt when a new message is sent
      const nowIso = new Date().toISOString();
      
      // If this is the first user message in the session, update the session title
      if (messages.length === 0) {
        const cleanedTitle = content
          .replace(/[\n\r]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 50);
        await dbService.updateSession(currentSessionId, {
          title: cleanedTitle || "New Conversation",
          updatedAt: nowIso,
        });
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId
              ? {
                  ...s,
                  title: cleanedTitle || "New Conversation",
                  updatedAt: nowIso,
                }
              : s
          )
        );
      } else {
        await dbService.updateSession(currentSessionId, {
          updatedAt: nowIso,
        });
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId ? { ...s, updatedAt: nowIso } : s
          )
        );
      }

      // Start streaming in a separate async function to avoid race conditions
      const startStreaming = async () => {
        try {
          abortControllerRef.current = new AbortController();
          // Construct effective system prompt with character information
          let effectiveSystemPrompt = systemPrompt;

          if (selectedCharacter) {
            const characterPrompt = `You are roleplaying as ${selectedCharacter.name}. ${selectedCharacter.description}

Embody this character completely:
- Respond in character at all times
- Use the character's personality, speaking style, and expertise
- Stay true to the character's role and background
- Never break character or mention that you are an AI assistant
- Respond as if you truly are ${selectedCharacter.name}`;

            if (effectiveSystemPrompt) {
              effectiveSystemPrompt = `${characterPrompt}\n\n${effectiveSystemPrompt}`;
            } else {
              effectiveSystemPrompt = characterPrompt;
            }
          }

          // Always send system prompt (with character info) as first message
          const systemMessage: ChatMessage[] = effectiveSystemPrompt
            ? [
                {
                  role: "system" as const,
                  content: effectiveSystemPrompt,
                  id: crypto.randomUUID(),
                  timestamp: new Date(),
                },
              ]
            : [];
          const summaryMessage: ChatMessage[] = chatSummary
            ? [
                {
                  role: "system" as const,
                  content: `Conversation summary: ${chatSummary}`,
                  id: crypto.randomUUID(),
                  timestamp: new Date(),
                },
              ]
            : [];
          const messageHistory: ChatMessage[] = [
            ...systemMessage,
            ...summaryMessage,
            // Limit to last 4 messages
            ...currentMessages.slice(-4),
            userMessage,
          ];

          let fullResponse = "";
          let lastUpdate = Date.now();
          let updateTimeout: NodeJS.Timeout | null = null;

          for await (const chunk of OllamaService.chatStream(
            selectedModel,
            messageHistory
          )) {
            // Check if request was cancelled
            if (abortControllerRef.current?.signal.aborted) {
              break;
            }

            fullResponse += chunk;
            const now = Date.now();

            if (now - lastUpdate > 100) {
              lastUpdate = now;
              const contentSnapshot = fullResponse;

              // Clear any pending update
              if (updateTimeout) {
                clearTimeout(updateTimeout);
                updateTimeout = null;
              }

              setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                  msg.id === assistantMessage.id
                    ? { ...msg, content: contentSnapshot }
                    : msg
                )
              );
            } else {
              // Debounce rapid updates - schedule an update if none is pending
              if (!updateTimeout) {
                updateTimeout = setTimeout(() => {
                  // Check if request is still active
                  if (!abortControllerRef.current?.signal.aborted) {
                    const contentSnapshot = fullResponse;
                    setMessages((prevMessages) =>
                      prevMessages.map((msg) =>
                        msg.id === assistantMessage.id
                          ? { ...msg, content: contentSnapshot }
                          : msg
                      )
                    );
                  }
                  updateTimeout = null;
                  lastUpdate = Date.now();
                }, 300); // Debounce delay
              }
            }
          }

          // Clear any pending update and do final update
          if (updateTimeout) {
            clearTimeout(updateTimeout);
          }

          // Final update with full content (only if not cancelled)
          if (!abortControllerRef.current?.signal.aborted) {
            setMessages((prevMessages) =>
              prevMessages.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: fullResponse }
                  : msg
              )
            );
          }

          // Asynchronous summary update
          setTimeout(async () => {
            const newHistory = [
              ...messageHistory,
              {
                role: "assistant" as const,
                content: fullResponse,
                id: crypto.randomUUID(),
                timestamp: new Date(),
              },
            ];
            const summaryResponse = await OllamaService.chatStream(
              selectedModel,
              [
                {
                  role: "system" as const,
                  content:
                    "Generate a concise summary of this conversation in 100 words or less.",
                  id: crypto.randomUUID(),
                  timestamp: new Date(),
                },
                ...newHistory,
              ]
            );
            let newSummary = "";
            for await (const chunk of summaryResponse) {
              newSummary += chunk;
            }
            setChatSummary(newSummary.trim());
          }, 0);
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            // Request was cancelled, remove the incomplete assistant message
            setMessages((prevMessages) =>
              prevMessages.filter((msg) => msg.id !== assistantMessage.id)
            );
          } else {
            const errorMessage =
              err instanceof Error ? err.message : "Failed to get response";
            setError(errorMessage);
            setMessages((prevMessages) =>
              prevMessages.map((msg) =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: `Error: ${errorMessage}` }
                  : msg
              )
            );
          }
        } finally {
          setIsLoading(false);
          abortControllerRef.current = null;
        }
      };

      // Start streaming
      startStreaming();
    },
    [
      selectedModel,
      isLoading,
      systemPrompt,
      messages,
      selectedCharacter,
      chatSummary,
      currentSessionId,
    ]
  );

  /**
   * Search across all saved sessions and current messages.
   * Returns array of {sessionId?, message} where sessionId undefined means current session.
   */
  const searchChats = useCallback(
    async (query: string) => {
      if (!query.trim()) return [];

      try {
        // Search in database
        const dbResults = await dbService.searchMessages(query);

        // Also search current messages (not yet saved to database)
        const lower = query.toLowerCase();
        const currentResults: Array<{
          sessionId?: string;
          message: ChatMessage;
        }> = [];

        messages.forEach((m) => {
          if (m.content.toLowerCase().includes(lower)) {
            currentResults.push({ message: m });
          }
        });

        // Combine database results with current session results
        const combinedResults = [
          ...currentResults,
          ...dbResults.map((result) => ({
            sessionId: result.sessionId,
            message: result.message,
          })),
        ];

        return combinedResults;
      } catch (error) {
        console.error("Failed to search in database:", error);
        // Fallback to local search
        const lower = query.toLowerCase();
        const results: Array<{ sessionId?: string; message: ChatMessage }> = [];

        messages.forEach((m) => {
          if (m.content.toLowerCase().includes(lower)) {
            results.push({ message: m });
          }
        });

        sessions.forEach((s) => {
          s.messages.forEach((m) => {
            if (m.content.toLowerCase().includes(lower)) {
              results.push({ sessionId: s.id, message: m });
            }
          });
        });
        return results;
      }
    },
    [messages, sessions]
  );

  // removed unused generateSessionTitle

  // Remove deduplication, signature, and duplicate auto-save logic

  // New chat: create a new session, set as current, clear messages
  const clearChat = useCallback(async () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: "New Conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      characterId: selectedCharacter?.id,
    };
    await dbService.createSession(newSession);
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
    setError(null);
  }, [selectedCharacter]);

  // Load session: set as current, load its messages
  const loadSession = useCallback(
    async (sessionId: string) => {
      isSwitchingSessionRef.current = true;
      setCurrentSessionId(sessionId);
      const session =
        sessions.find((s) => s.id === sessionId) ||
        (await dbService.getSession(sessionId));
      if (session) {
        startTransition(() => {
          setMessages(session.messages);
          if (session.characterId) {
            const foundChar = characters.find(
              (c) => c.id === session.characterId
            );
            setSelectedCharacter(foundChar);
          } else {
            setSelectedCharacter(undefined);
          }
        });
      }
      // Re-enable autosave after this turn of the event loop
      setTimeout(() => {
        isSwitchingSessionRef.current = false;
      }, 0);
    },
    [sessions, characters]
  );

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const renameSession = useCallback(
    async (sessionId: string, newTitle: string) => {
      try {
        await dbService.updateSession(sessionId, {
          title: newTitle.trim() || "Untitled",
        });
        setSessions((prev) =>
          prev.map((session) =>
            session.id === sessionId
              ? { ...session, title: newTitle.trim() || "Untitled" }
              : session
          )
        );
      } catch (error) {
        console.error("Failed to rename session in database:", error);
        // Update local state anyway
        setSessions((prev) =>
          prev.map((session) =>
            session.id === sessionId
              ? { ...session, title: newTitle.trim() || "Untitled" }
              : session
          )
        );
      }
    },
    []
  );

  // When deleting a session, remove its signature from the set
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await dbService.deleteSession(sessionId);
        setSessions((prev) =>
          prev.filter((session) => session.id !== sessionId)
        );
        // Remove from signature cache
        sessionSignatureCache.current.delete(sessionId);
      } catch (error) {
        console.error("Failed to delete session from database:", error);
        // Update local state anyway
        setSessions((prev) =>
          prev.filter((session) => session.id !== sessionId)
        );
        // Remove from signature cache
        sessionSignatureCache.current.delete(sessionId);
      }
    },
    [sessions]
  );

  const duplicateSession = useCallback(
    async (sessionId: string) => {
      try {
        const newSessionId = crypto.randomUUID();
        const newTitle =
          sessions.find((s) => s.id === sessionId)?.title + " (Copy)" || "Copy";

        const newSession = await dbService.duplicateSession(
          sessionId,
          newSessionId,
          newTitle
        );
        if (newSession) {
          setSessions((prev) => [newSession, ...prev]);
        }
      } catch (error) {
        console.error("Failed to duplicate session in database:", error);
        // Fallback to local duplication
        const session = sessions.find((s) => s.id === sessionId);
        if (session) {
          const newSession: ChatSession = {
            ...session,
            id: crypto.randomUUID(),
            title: `${session.title} (Copy)`,
            createdAt: new Date().toISOString(),
          };
          setSessions((prev) => [newSession, ...prev]);
        }
      }
    },
    [sessions]
  );

  // Cache for session message signatures to avoid repeated JSON.stringify calls
  const sessionSignatureCache = useRef<Map<string, string>>(new Map());

  // getCurrentSessionId: just return currentSessionId
  const getCurrentSessionId = useCallback(
    () => currentSessionId,
    [currentSessionId]
  );

  // getCurrentSession: return session by id
  const getCurrentSession = useCallback(() => {
    return currentSessionId
      ? sessions.find((s) => s.id === currentSessionId) || null
      : null;
  }, [currentSessionId, sessions]);

  const getSessionsByDateGroup = useCallback(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const groups = {
      today: [] as ChatSession[],
      yesterday: [] as ChatSession[],
      thisWeek: [] as ChatSession[],
      thisMonth: [] as ChatSession[],
      older: [] as ChatSession[],
    };

    sessions.forEach((session) => {
      const sessionDate = new Date(session.updatedAt || session.createdAt);
      const sessionDay = new Date(
        sessionDate.getFullYear(),
        sessionDate.getMonth(),
        sessionDate.getDate()
      );

      if (sessionDay.getTime() === today.getTime()) {
        groups.today.push(session);
      } else if (sessionDay.getTime() === yesterday.getTime()) {
        groups.yesterday.push(session);
      } else if (sessionDate >= thisWeek) {
        groups.thisWeek.push(session);
      } else if (sessionDate >= thisMonth) {
        groups.thisMonth.push(session);
      } else {
        groups.older.push(session);
      }
    });

    // Sort each group by last updated (updatedAt or createdAt)
    Object.values(groups).forEach((group) => {
      group.sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() -
          new Date(a.updatedAt || a.createdAt).getTime()
      );
    });

    return groups;
  }, [sessions]);

  const sortedSessions = useCallback(
    (sortBy: "date" | "name" | "length" = "date") => {
      const sorted = [...sessions];
      switch (sortBy) {
        case "date":
          return sorted.sort(
            (a, b) =>
              new Date(b.updatedAt || b.createdAt).getTime() -
              new Date(a.updatedAt || a.createdAt).getTime()
          );
        case "name":
          return sorted.sort((a, b) => a.title.localeCompare(b.title));
        case "length":
          return sorted.sort((a, b) => b.messages.length - a.messages.length);
        default:
          return sorted;
      }
    },
    [sessions]
  );

  const exportSessions = useCallback(async () => {
    try {
      // Use database service for file operations if in Electron
      if (typeof window !== "undefined" && window.electronAPI) {
        await dbService.exportToFile();
        return;
      }

      // Fallback to browser download for development
      const exportData = await dbService.exportSessions();
      if (messages.length > 0) {
        (exportData as Record<string, unknown>).currentMessages = messages;
      }

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(dataBlob);
      link.download = `chaichat-export-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Failed to export sessions:", error);
    }
  }, [messages]);

  const importSessions = useCallback(
    async (file?: File) => {
      try {
        // Use database service for file operations if in Electron and no file provided
        if (!file && typeof window !== "undefined" && window.electronAPI) {
          const importedCount = await dbService.importFromFile();
          if (importedCount > 0) {
            // Reload sessions from database
            const dbSessions = await dbService.getAllSessions();
            setSessions(dbSessions);
          }
          return importedCount > 0;
        }

        // Handle file-based import (for development or when file is provided)
        if (!file) {
          throw new Error("No file provided for import");
        }

        return new Promise<boolean>((resolve, reject) => {
          const reader = new FileReader();

          reader.onload = async (e) => {
            try {
              const content = e.target?.result as string;
              const importData = JSON.parse(content);

              // Use database service to import
              const importedCount = await dbService.importSessions(importData);

              if (importedCount > 0) {
                // Reload sessions from database
                const dbSessions = await dbService.getAllSessions();
                setSessions(dbSessions);
              }

              // Optionally restore current messages if they exist and current chat is empty
              if (importData.currentMessages && messages.length === 0) {
                const revivedMessages = (
                  importData.currentMessages as ChatMessage[]
                ).map((msg) => ({
                  ...msg,
                  timestamp: new Date(msg.timestamp),
                }));
                setMessages(revivedMessages);
              }

              resolve(importedCount > 0);
            } catch (err) {
              reject(
                new Error(
                  `Failed to import sessions: ${
                    err instanceof Error ? err.message : "Unknown error"
                  }`
                )
              );
            }
          };

          reader.onerror = () => {
            reject(new Error("Failed to read import file"));
          };

          reader.readAsText(file);
        });
      } catch (error) {
        console.error("Import failed:", error);
        throw error;
      }
    },
    [messages, setMessages, setSessions]
  );

  const exportSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        session: session,
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(dataBlob);
      link.download = `chaichat-session-${session.title.replace(
        /[^a-zA-Z0-9]/g,
        "-"
      )}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    },
    [sessions]
  );

  // saveCurrentAsSession: just updates title/characterId for current session
  const saveCurrentAsSession = useCallback(
    async (title?: string) => {
      if (!currentSessionId) return null;
      await dbService.updateSession(currentSessionId, {
        title: title || "Saved Conversation",
        characterId: selectedCharacter?.id,
        updatedAt: new Date().toISOString(),
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                title: title || "Saved Conversation",
                characterId: selectedCharacter?.id,
                updatedAt: new Date().toISOString(),
              }
            : s
        )
      );
      return currentSessionId;
    },
    [currentSessionId, selectedCharacter]
  );

  // Character management functions
  const loadCharacters = useCallback(async () => {
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
  }, []);

  const createCharacter = useCallback(async (character: Character) => {
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
  }, []);

  const updateCharacter = useCallback(
    async (characterId: string, updates: Partial<Character>) => {
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
    },
    [selectedCharacter]
  );

  const deleteCharacter = useCallback(
    async (characterId: string) => {
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
    },
    [selectedCharacter]
  );

  const duplicateCharacter = useCallback(async (character: Character) => {
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
  }, []);

  const selectCharacter = useCallback((character: Character | undefined) => {
    setSelectedCharacter(character);
  }, []);

  return {
    messages,
    sessions,
    models,
    selectedModel,
    setSelectedModel,
    isLoading,
    isModelsLoading,
    error,
    isOllamaConnected,
    sendMessage,
    clearChat,
    loadSession,
    stopGeneration,
    loadModels,
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
