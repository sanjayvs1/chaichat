import type { ChatMessage, Character, AIProvider, ProviderStatus } from "../types/ollama";
import { OllamaService } from "../services/ollama";
import { GroqService } from "../services/groq";
import { dbService } from "../services/database";

export interface MessageHandlerParams {
  selectedModel: string;
  selectedProvider: AIProvider;
  isLoading: boolean;
  currentSessionId: string | null;
  messages: ChatMessage[];
  systemPrompt: string;
  selectedCharacter?: Character;
  chatSummary: string;
  providerStatus: ProviderStatus;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setChatSummary: React.Dispatch<React.SetStateAction<string>>;
  setSessions: React.Dispatch<React.SetStateAction<any[]>>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
}

export const sendMessageHandler = async (
  content: string,
  params: MessageHandlerParams
) => {
  const {
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
  } = params;

  if (!selectedModel || isLoading || !currentSessionId) return;
  
  // Check if the provider is available
  if (!providerStatus[selectedProvider]) {
    setError(`${selectedProvider === 'groq' ? 'Groq' : 'Ollama'} is not connected. Please check your connection${selectedProvider === 'groq' ? ' and API key' : ''}.`);
    return;
  }

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

      // Use the appropriate service based on selected provider
      const streamGenerator = selectedProvider === 'ollama' 
        ? OllamaService.chatStream(selectedModel, messageHistory)
        : GroqService.chatStream(selectedModel, messageHistory);

      for await (const chunk of streamGenerator) {
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
        const summaryStreamGenerator = selectedProvider === 'ollama'
          ? OllamaService.chatStream(selectedModel, [
              {
                role: "system" as const,
                content: "Generate a concise summary of this conversation in 100 words or less.",
                id: crypto.randomUUID(),
                timestamp: new Date(),
              },
              ...newHistory,
            ])
          : GroqService.chatStream(selectedModel, [
              {
                role: "system" as const,
                content: "Generate a concise summary of this conversation in 100 words or less.",
                id: crypto.randomUUID(),
                timestamp: new Date(),
              },
              ...newHistory,
            ]);
        
        const summaryResponse = summaryStreamGenerator;
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
};

export const searchChatsHandler = async (
  query: string,
  messages: ChatMessage[],
  sessions: any[]
) => {
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
      s.messages.forEach((m: ChatMessage) => {
        if (m.content.toLowerCase().includes(lower)) {
          results.push({ sessionId: s.id, message: m });
        }
      });
    });
    return results;
  }
};

export const stopGenerationHandler = (
  abortControllerRef: React.MutableRefObject<AbortController | null>
) => {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }
};
