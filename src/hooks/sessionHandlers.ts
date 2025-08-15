import type { ChatSession, ChatMessage, Character, AIProvider } from "../types/ollama";
import { dbService } from "../services/database";
import { GroqService } from "../services/groq";

export interface SessionHandlerParams {
  sessions: ChatSession[];
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setChatSummary: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  selectedCharacter?: Character;
  selectedProvider: AIProvider;
  selectedModel: string;
  currentSessionId: string | null;
  messages: ChatMessage[];
  isSwitchingSessionRef: React.MutableRefObject<boolean>;
  sessionSignatureCache: React.MutableRefObject<Map<string, string>>;
}

export const createNewSession = async (
  params: Pick<SessionHandlerParams, 'selectedCharacter' | 'selectedProvider' | 'selectedModel'>
): Promise<ChatSession> => {
  const newSession: ChatSession = {
    id: crypto.randomUUID(),
    title: "New Conversation",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    characterId: params.selectedCharacter?.id,
    provider: params.selectedProvider || 'ollama',
    selectedModel: params.selectedModel || '',
  };
  console.log('Creating new session with provider:', newSession.provider, 'model:', newSession.selectedModel);
  await dbService.createSession(newSession);
  return newSession;
};

export const clearChatHandler = async (params: SessionHandlerParams) => {
  const { setChatSummary, setSessions, setCurrentSessionId, setMessages, setError } = params;
  
  // Clear chat summary to prevent context bleeding into new conversations
  setChatSummary("");
  
  // Reset Groq client to ensure clean state
  GroqService.resetClient();
  
  const newSession = await createNewSession(params);
  setSessions((prev) => [newSession, ...prev]);
  setCurrentSessionId(newSession.id);
  setMessages([]);
  setError(null);
};

export const loadSessionHandler = async (
  sessionId: string,
  params: SessionHandlerParams,
  characters: Character[],
  setSelectedProvider: React.Dispatch<React.SetStateAction<AIProvider>>,
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>,
  setSelectedCharacter: React.Dispatch<React.SetStateAction<Character | undefined>>,
  startTransition: (callback: () => void) => void
) => {
  const {
    isSwitchingSessionRef,
    setCurrentSessionId,
    setChatSummary,
    sessions,
    setMessages
  } = params;
  
  isSwitchingSessionRef.current = true;
  
  // Clear chat summary when switching sessions to prevent context bleeding
  setChatSummary("");
  
  // Reset Groq client to prevent any potential context bleeding
  GroqService.resetClient();
  
  // First check if session is already in memory (sessions array)
  let session = sessions.find((s) => s.id === sessionId);
  
  // Only fetch from DB if not found in memory or if messages might be stale
  if (!session || session.messages.length === 0) {
    console.log('Fetching session from DB:', sessionId);
    const dbSession = await dbService.getSession(sessionId);
    if (dbSession) {
      session = dbSession;
      // Update the in-memory sessions array with fresh data
      params.setSessions(prevSessions => 
        prevSessions.map(s => s.id === sessionId ? dbSession : s)
      );
    }
  } else {
    console.log('Using cached session data:', sessionId);
  }
  
  console.log('Loading session:', sessionId, 'data:', {
    provider: session?.provider,
    selectedModel: session?.selectedModel,
    characterId: session?.characterId,
    messageCount: session?.messages.length
  });
  
  if (session) {
    // Batch all state updates to minimize re-renders
    startTransition(() => {
      // Update current session immediately
      setCurrentSessionId(sessionId);
      
      // Restore provider and model (high priority)
      if (session.provider) {
        console.log('Restoring provider for session:', sessionId, 'to:', session.provider);
        setSelectedProvider(session.provider);
      }
      if (session.selectedModel) {
        console.log('Restoring model for session:', sessionId, 'to:', session.selectedModel);
        setSelectedModel(session.selectedModel);
      }
      
      // Update messages and character together
      setMessages(session.messages);
      
      // Restore character
      if (session.characterId) {
        const foundChar = characters.find(
          (c) => c.id === session.characterId
        );
        setSelectedCharacter(foundChar);
      } else {
        setSelectedCharacter(undefined);
      }
    });
  } else {
    // Session not found, just update the current session ID
    setCurrentSessionId(sessionId);
  }
  
  // Re-enable autosave after this turn of the event loop
  setTimeout(() => {
    isSwitchingSessionRef.current = false;
  }, 0);
};

export const renameSessionHandler = async (
  sessionId: string,
  newTitle: string,
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>
) => {
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
};

export const deleteSessionHandler = async (
  sessionId: string,
  params: SessionHandlerParams
) => {
  const { setSessions, sessionSignatureCache } = params;
  
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
};

export const duplicateSessionHandler = async (
  sessionId: string,
  sessions: ChatSession[],
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>
) => {
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
};

export const saveCurrentAsSessionHandler = async (
  currentSessionId: string | null,
  selectedCharacter: Character | undefined,
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>,
  title?: string
) => {
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
};

export const getSessionsByDateGroup = (sessions: ChatSession[]) => {
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
};

export const sortedSessionsHandler = (
  sessions: ChatSession[],
  sortBy: "date" | "name" | "length" = "date"
) => {
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
};
