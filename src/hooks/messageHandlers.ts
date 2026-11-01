import type { ChatMessage, Character, AIProvider, ProviderStatus, ChatSession } from "../types/chat";
import { LLMService } from "../services/llm";
import { dbService } from "../services/database";
import type { CharacterMemory } from "../types/chat";
import { startTransition as startTransitionSafe } from "react";

export interface MessageHandlerParams {
  selectedModel: string;
  selectedProvider: AIProvider;
  providerName: string;
  isLoading: boolean;
  currentSessionId: string | null;
  // Read the latest messages at generation time (avoids stale closures during ask-all)
  getMessages: () => ChatMessage[];
  systemPrompt: string;
  // Characters that should respond to this message (empty = plain assistant mode)
  targets: Character[];
  providerStatus: ProviderStatus;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
}

// Context window tuning
const MAX_HISTORY_MESSAGES = 24;
const MAX_MEMORIES_IN_PROMPT = 30;
const MAX_MEMORIES_PER_CHARACTER = 40;
const MEMORY_EXTRACTION_MIN_INTERVAL_MS = 60_000;

// Throttle memory extraction per character (module-level so it survives re-renders)
const lastExtractionAt = new Map<string, number>();

export function composeCharacterPrompt(character: Character): string {
  if (character.systemPrompt && character.systemPrompt.trim()) {
    return character.systemPrompt.trim();
  }
  const lines = [`You are ${character.name}.`];
  if (character.tagline) lines.push("", character.tagline);
  if (character.description) {
    lines.push("", "Personality & background:", character.description.trim());
  }
  lines.push(
    "",
    "Roleplay guidelines:",
    "- Always stay fully in character",
    "- Speak, think, and react the way this character would",
    "- Never break character or mention being an AI or language model",
    "- Keep responses conversational, engaging and true to the character's voice"
  );
  return lines.join("\n");
}

function buildSystemMessages(
  target: Character,
  globalSystemPrompt: string,
  memories: CharacterMemory[]
): ChatMessage[] {
  const systemMessages: ChatMessage[] = [];

  let effectivePrompt = composeCharacterPrompt(target);
  if (globalSystemPrompt.trim()) {
    effectivePrompt += `\n\nAdditional instructions:\n${globalSystemPrompt.trim()}`;
  }

  systemMessages.push({
    role: "system",
    content: effectivePrompt,
    id: crypto.randomUUID(),
    timestamp: new Date(),
  });

  if (memories.length > 0) {
    const memoryBlock = memories
      .slice(0, MAX_MEMORIES_IN_PROMPT)
      .map((m) => `- ${m.content}`)
      .join("\n");
    systemMessages.push({
      role: "system",
      content:
        `Things you remember about the user and your past interactions ` +
        `(recall these naturally when relevant, don't list them):\n${memoryBlock}`,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    });
  }

  return systemMessages;
}

/**
 * Each character only sees their own slice of the conversation:
 * - messages they authored (assistant messages with their characterId)
 * - user messages addressed to them (or broadcast messages with no target)
 */
function filterContextForCharacter(messages: ChatMessage[], target?: Character): ChatMessage[] {
  const relevant = target
    ? messages.filter((m) => {
        if (m.role === "assistant") return m.characterId === target.id;
        if (m.role === "user") return !m.targetId || m.targetId === target.id;
        return false;
      })
    : messages;

  // Keep a recent chronological window (order preserved — LLMs need coherent flow)
  return relevant.slice(-MAX_HISTORY_MESSAGES);
}

async function loadMemoriesForTarget(target: Character): Promise<CharacterMemory[]> {
  try {
    return await dbService.getMemoriesForCharacter(target.id);
  } catch (err) {
    console.warn("Failed to load memories for", target.name, err);
    return [];
  }
}

/**
 * Extract durable facts from a recent exchange and store them as memories.
 * Fire-and-forget; failures are logged but never interrupt chatting.
 */
async function extractMemoriesInBackground(
  target: Character,
  exchangeMessages: ChatMessage[],
  sessionId: string | null,
  provider: AIProvider,
  model: string
): Promise<void> {
  if (!target.memoryEnabled) return;
  if (!model) return;

  // Throttle: at most one extraction run per interval per character
  const now = Date.now();
  const lastRun = lastExtractionAt.get(target.id) ?? 0;
  if (now - lastRun < MEMORY_EXTRACTION_MIN_INTERVAL_MS) return;
  lastExtractionAt.set(target.id, now);

  try {
    const transcript = exchangeMessages
      .filter((m) => m.content.trim())
      .slice(-8)
      .map((m) =>
        m.role === "user"
          ? `User: ${m.content}`
          : `${target.name}: ${m.content}`
      )
      .join("\n");

    if (!transcript.trim()) return;

    const prompt: ChatMessage[] = [      {
        role: "system",
        content:
          "You extract long-term memories for a roleplay character. From the conversation excerpt, extract durable facts worth remembering in FUTURE conversations. Focus on facts about the USER (name, preferences, personal details, projects, people/pets in their life, ongoing topics, promises made) and important events in the conversation.\n" +
          "Rules:\n" +
          "- Output one fact per line, each starting with '- '\n" +
          "- Each fact must be self-contained and specific (e.g. 'The user's cat is named Whiskers')\n" +
          "- Maximum 3 facts. Skip small talk and transient details.\n" +
          "- If there is nothing worth remembering, output exactly: NONE",
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
      {
        role: "user",
        content: transcript,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      },
    ];

    let result = "";
    for await (const chunk of LLMService.chatStream(provider, model, prompt, new AbortController().signal)) {
      result += chunk;
    }

    const lines = result
      .split("\n")
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter(
        (l) =>
          l &&
          l.toUpperCase() !== "NONE" &&
          l.length >= 8 &&
          l.length <= 300 &&
          !/^(here are|sure|i've extracted|extracted)/i.test(l)
      );

    if (lines.length === 0) return;

    const existing = await dbService.getMemoriesForCharacter(target.id);

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const isDuplicate = (candidate: string) => {
      const c = normalize(candidate);
      return existing.some((m) => {
        const e = normalize(m.content);
        return e.includes(c) || c.includes(e);
      });
    };

    for (const line of lines.slice(0, 3)) {
      if (isDuplicate(line)) continue;

      const nowIso = new Date().toISOString();
      await dbService.createMemory({
        id: crypto.randomUUID(),
        characterId: target.id,
        content: line,
        createdAt: nowIso,
        updatedAt: nowIso,
        sourceSessionId: sessionId,
      });
      existing.unshift({ id: "", characterId: target.id, content: line, createdAt: nowIso, updatedAt: nowIso });
    }

    // Enforce cap: delete oldest beyond MAX_MEMORIES_PER_CHARACTER
    const all = await dbService.getMemoriesForCharacter(target.id);
    if (all.length > MAX_MEMORIES_PER_CHARACTER) {
      for (const mem of all.slice(MAX_MEMORIES_PER_CHARACTER)) {
        await dbService.deleteMemory(mem.id).catch(() => {});
      }
    }

    console.log(`[memory] ${target.name}: stored ${Math.min(lines.length, 3)} candidate fact(s)`);
  } catch (err) {
    console.warn("Memory extraction failed (non-blocking):", err);
  }
}

export interface SendMessageOptions {
  /** Don't add a new user message — regenerate a response from existing history (edit/resend/continue) */
  skipUserMessage?: boolean;
  /** Nudge appended to the request so the model continues where it stopped */
  continueNudge?: string;
}

export const sendMessageHandler = async (
  content: string,
  params: MessageHandlerParams,
  options: SendMessageOptions = {}
) => {
  const {
    selectedModel,
    selectedProvider,
    providerName,
    isLoading,
    currentSessionId,
    getMessages,
    systemPrompt,
    targets,
    providerStatus,
    setIsLoading,
    setError,
    setMessages,
    setSessions,
    abortControllerRef,
  } = params;

  const { skipUserMessage = false, continueNudge } = options;

  if (!selectedModel || isLoading || !currentSessionId) return;

  // Regenerating/continuing requires an existing conversation to respond to
  const existingMessages = getMessages();
  if (skipUserMessage && !existingMessages.some((m) => m.role === "user")) return;

  // Check if the provider is available
  if (!providerStatus[selectedProvider]) {
    setError(`${providerName} is not connected. Check it under Connections.`);
    return;
  }

  // Cancel any ongoing request with priority handling
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const currentMessages = getMessages();

  // The user message this response responds to (existing when regenerating)
  const lastUserMessage = [...currentMessages].reverse().find((m) => m.role === "user");

  // One broadcast user message when several characters will answer,
  // otherwise address the single target directly.
  const primaryTarget = targets[0];
  const userMessage: ChatMessage = skipUserMessage
    ? (lastUserMessage ?? {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
      })
    : {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
        targetId: primaryTarget?.id,
      };

  // Assistant placeholders for every responding character.
  // When regenerating, replace the trailing assistant placeholder(s) instead of appending.
  const assistantMessages: ChatMessage[] = targets.map(
    (target): ChatMessage => ({
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      characterId: target.id || undefined,
    })
  );

  // Plain assistant mode (no characters involved)
  if (targets.length === 0) {
    assistantMessages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    });
  }

  setIsLoading(true);
  setError(null);
  if (skipUserMessage) {
    // Drop empty assistant placeholders (previous aborted attempts), then append fresh ones
    setMessages((prev) => [
      ...prev.filter((m) => !(m.role === "assistant" && m.content === "")),
      ...assistantMessages,
    ]);
  } else {
    setMessages((prev) => [...prev, userMessage, ...assistantMessages]);
  }

  // Update session title / timestamps
  const nowIso = new Date().toISOString();
  if (currentMessages.length === 0) {
    const cleanedTitle =
      content
        .replace(/[\n\r]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 50) || "New Conversation";
    await dbService.updateSession(currentSessionId, { title: cleanedTitle, updatedAt: nowIso });
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId ? { ...s, title: cleanedTitle, updatedAt: nowIso } : s
      )
    );
  } else {
    await dbService.updateSession(currentSessionId, { updatedAt: nowIso });
    setSessions((prev) =>
      prev.map((s) => (s.id === currentSessionId ? { ...s, updatedAt: nowIso } : s))
    );
  }

  abortControllerRef.current = new AbortController();
  const signal = abortControllerRef.current.signal;

  // Completed responses from this send — merged into context immediately so
  // the next character always sees earlier answers even before React commits.
  const pendingResponses: ChatMessage[] = [];

  try {
    // Sequentially generate a response for each target so each gets its own context.
    for (let i = 0; i < Math.max(targets.length, 1); i++) {
      if (signal.aborted) break;

      const target = targets[i];
      const assistantMessage = targets.length > 0 ? assistantMessages[i] : assistantMessages[0];

      // Fresh history includes any earlier responses from this same send (ask-all)
      const latestList = getMessages();
      const knownIds = new Set(latestList.map((m) => m.id));
      const latestMessages = [...latestList, ...pendingResponses.filter((m) => !knownIds.has(m.id))];
      const relevantHistory = filterContextForCharacter(latestMessages, target);

      const memories = target && target.memoryEnabled !== false ? await loadMemoriesForTarget(target) : [];
      const systemMessages = target ? buildSystemMessages(target, systemPrompt, memories) : systemPrompt.trim() ? [{ role: "system" as const, content: systemPrompt.trim(), id: crypto.randomUUID(), timestamp: new Date() }] : [];

      const messageHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        ...systemMessages.map(({ role, content }) => ({ role, content })),
        // Skip empty assistant placeholders (e.g., the response being generated now)
        ...relevantHistory
          .filter((m) => !(m.role === "assistant" && m.content === ""))
          .map(({ role, content }) => ({ role, content })),
      ];

      // Non-persisted nudge so the model continues seamlessly (continue button)
      if (continueNudge) {
        messageHistory.push({ role: "user", content: continueNudge });
      }

      let fullResponse = "";
      let lastUpdate = Date.now();
      let updateTimeout: ReturnType<typeof setTimeout> | null = null;

      const pushUpdate = (snapshot: string) => {
        startTransitionSafe(() => {
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === assistantMessage.id ? { ...msg, content: snapshot } : msg
            )
          );
        });
      };

      for await (const chunk of LLMService.chatStream(selectedProvider, selectedModel, messageHistory, signal)) {
        if (signal.aborted) break;
        fullResponse += chunk;

        const nowMs = Date.now();
        if (nowMs - lastUpdate > 150) {
          lastUpdate = nowMs;
          if (updateTimeout) {
            clearTimeout(updateTimeout);
            updateTimeout = null;
          }
          pushUpdate(fullResponse);
        } else if (!updateTimeout) {
          updateTimeout = setTimeout(() => {
            updateTimeout = null;
            lastUpdate = Date.now();
            if (!signal.aborted) pushUpdate(fullResponse);
          }, 250);
        }
      }

      if (updateTimeout) clearTimeout(updateTimeout);

      if (!signal.aborted) {
        pushUpdate(fullResponse);
        pendingResponses.push({ ...assistantMessage, content: fullResponse });

        // Background per-character memory extraction
        if (target) {
          const exchange = [...relevantHistory, { ...userMessage, content }, { role: "assistant" as const, content: fullResponse, id: assistantMessage.id, timestamp: new Date() }];
          setTimeout(() => {
            extractMemoriesInBackground(target, exchange, currentSessionId, selectedProvider, selectedModel).catch(() => {});
          }, 1500);
        }
      } else {
        // Aborted mid-stream: keep partial response if there is one, drop empty placeholders
        if (!fullResponse) {
          setMessages((prevMessages) => prevMessages.filter((msg) => msg.id !== assistantMessage.id));
        }
        break;
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // Remove empty assistant placeholders on cancel
      setMessages((prevMessages) => prevMessages.filter((msg) => !(msg.role === "assistant" && msg.content === "")));
    } else {
      const errorMessage = err instanceof Error ? err.message : "Failed to get response";
      setError(errorMessage);
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          assistantMessages.some((am) => am.id === msg.id) && msg.content === ""
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

export const searchChatsHandler = async (
  query: string,
  messages: ChatMessage[],
  sessions: ChatSession[]
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
