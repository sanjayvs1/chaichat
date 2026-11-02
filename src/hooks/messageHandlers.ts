import type {
  AIProvider,
  AppSettings,
  Character,
  CharacterMemory,
  ChatMessage,
  ChatSession,
  GenerationParams,
  Persona,
  PromptReport,
  ProviderStatus,
  VectorMatch,
} from "../types/chat";
import { LLMService, completeChat } from "../services/llm";
import { dbService } from "../services/database";
import { CONTINUE_NUDGE, IMPERSONATE_NUDGE, applyMacros, buildPrompt, resolveUserName } from "../lib/prompt";
import { recallMessages } from "./memoryHandlers";
import { startTransition as startTransitionSafe } from "react";

export interface GenerationContext {
  selectedModel: string;
  selectedProvider: AIProvider;
  providerName: string;
  isLoading: boolean;
  currentSessionId: string | null;
  // Read the latest values at generation time (avoids stale closures during group replies)
  getMessages: () => ChatMessage[];
  getSession: () => ChatSession | undefined;
  systemPrompt: string;
  settings: AppSettings;
  persona?: Persona;
  characters: Character[];
  groupNames: string[];
  providerStatus: ProviderStatus;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setMemoryError: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setLastPrompt: React.Dispatch<React.SetStateAction<PromptReport | null>>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
}

export type GenerationRequest =
  // Empty content asks for a reply without adding a user message
  | { mode: "send"; content: string; targets: Character[]; broadcast?: boolean }
  // Adds a new version of the last message
  | { mode: "regenerate"; target?: Character }
  // Extends the last message in place
  | { mode: "continue"; target?: Character };

// Room left for the reply when the user didn't set a limit
const DEFAULT_RESPONSE_TOKENS = 512;
const MAX_MEMORIES_PER_CHARACTER = 40;
const MEMORY_EXTRACTION_MIN_INTERVAL_MS = 60_000;

// Throttle memory extraction per character (module-level so it survives re-renders)
const lastExtractionAt = new Map<string, number>();

const responseTokens = (settings: AppSettings) => settings.generation.maxTokens || DEFAULT_RESPONSE_TOKENS;

async function loadMemoriesForTarget(target: Character): Promise<CharacterMemory[]> {
  try {
    return await dbService.getMemoriesForCharacter(target.id);
  } catch (err) {
    console.warn("Failed to load memories for", target.name, err);
    return [];
  }
}

export async function assemblePrompt(
  context: GenerationContext,
  target: Character | undefined,
  history: ChatMessage[],
  nudge?: string
): Promise<PromptReport> {
  const { settings, currentSessionId, setMemoryError } = context;
  const session = context.getSession();
  const generation = settings.generation;
  const budget = Math.max(generation.contextTokens - responseTokens(settings), 256);

  const memories = target && target.memoryEnabled !== false ? await loadMemoriesForTarget(target) : [];

  // Recall is a bonus, a failed embedding server shouldn't stop the chat
  let recalled: VectorMatch[] = [];
  if (currentSessionId) {
    try {
      recalled = await recallMessages({
        sessionId: currentSessionId,
        messages: history,
        target,
        settings: settings.vectors,
        budget,
      });
      setMemoryError(null);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : "Vector recall failed");
    }
  }

  return buildPrompt({
    target,
    characters: context.characters,
    groupNames: context.groupNames,
    persona: context.persona,
    globalInstructions: context.systemPrompt,
    memories,
    summary: session?.summary,
    recalled,
    authorNote: session?.authorNote,
    messages: history,
    groupContext: settings.groupContext,
    contextTokens: generation.contextTokens,
    responseTokens: responseTokens(settings),
    nudge,
  });
}

function requestParams(context: GenerationContext, target: Character | undefined): Partial<GenerationParams> {
  const params = context.settings.generation;
  // Stops the model from writing the user's next line for them
  const stop = target ? [`\n${resolveUserName(context.persona)}:`, ...params.stop] : params.stop;
  return {
    temperature: params.temperature,
    topP: params.topP,
    frequencyPenalty: params.frequencyPenalty,
    presencePenalty: params.presencePenalty,
    maxTokens: params.maxTokens,
    seed: params.seed,
    stop,
  };
}

// Streams one reply, handing the text so far to onText at a rate the UI can keep up with
async function streamReply(
  context: GenerationContext,
  target: Character | undefined,
  history: ChatMessage[],
  signal: AbortSignal,
  onText: (text: string) => void,
  nudge?: string
): Promise<string> {
  const report = await assemblePrompt(context, target, history, nudge);
  context.setLastPrompt(report);

  let fullResponse = "";
  let lastUpdate = Date.now();
  let updateTimeout: ReturnType<typeof setTimeout> | null = null;

  const stream = LLMService.chatStream(
    context.selectedProvider,
    context.selectedModel,
    report.messages,
    signal,
    requestParams(context, target)
  );

  for await (const chunk of stream) {
    if (signal.aborted) break;
    fullResponse += chunk;

    const nowMs = Date.now();
    if (nowMs - lastUpdate > 150) {
      lastUpdate = nowMs;
      if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }
      onText(fullResponse);
    } else if (!updateTimeout) {
      updateTimeout = setTimeout(() => {
        updateTimeout = null;
        lastUpdate = Date.now();
        if (!signal.aborted) onText(fullResponse);
      }, 250);
    }
  }

  if (updateTimeout) clearTimeout(updateTimeout);
  onText(fullResponse);
  return fullResponse;
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

    const result = await completeChat(provider, model, prompt);

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

const isAbort = (err: unknown) => err instanceof Error && err.name === "AbortError";
const failureText = (err: unknown) => (err instanceof Error ? err.message : "Failed to get response");

function canGenerate(context: GenerationContext): boolean {
  const { selectedModel, isLoading, currentSessionId, selectedProvider, providerStatus, providerName, setError } = context;
  if (!selectedModel || isLoading || !currentSessionId) return false;
  if (!providerStatus[selectedProvider]) {
    setError(`${providerName} is not connected. Check it under Connections.`);
    return false;
  }
  return true;
}

async function touchSession(context: GenerationContext, content: string) {
  const { currentSessionId, getMessages, setSessions } = context;
  if (!currentSessionId) return;

  const nowIso = new Date().toISOString();
  const isFirstUserMessage = content && !getMessages().some((m) => m.role === "user");
  const title = isFirstUserMessage
    ? content.replace(/\s+/g, " ").trim().slice(0, 50) || "New Conversation"
    : undefined;

  await dbService.updateSession(currentSessionId, { updatedAt: nowIso, ...(title ? { title } : {}) });
  setSessions((prev) =>
    prev.map((s) => (s.id === currentSessionId ? { ...s, updatedAt: nowIso, ...(title ? { title } : {}) } : s))
  );
}

// Regenerate and continue both rewrite the last message, the only difference being
// which version they write to and what they keep
async function rewriteLastMessage(
  request: Extract<GenerationRequest, { mode: "regenerate" | "continue" }>,
  context: GenerationContext,
  signal: AbortSignal
) {
  const { getMessages, setMessages, setError } = context;
  const messages = getMessages();
  const original = messages[messages.length - 1];
  if (original?.role !== "assistant") return;

  const isContinue = request.mode === "continue";
  const versions = original.swipes?.length ? original.swipes : [original.content];
  const swipes = isContinue ? versions : [...versions, ""];
  const swipeIndex = isContinue ? (original.swipeIndex ?? 0) : swipes.length - 1;
  const base = isContinue ? original.content : "";

  const write = (text: string) => {
    const content = base + text;
    startTransitionSafe(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === original.id
            ? { ...m, content, swipeIndex, swipes: swipes.map((v, i) => (i === swipeIndex ? content : v)) }
            : m
        )
      );
    });
  };
  const restore = () => setMessages((prev) => prev.map((m) => (m.id === original.id ? original : m)));

  write("");
  try {
    const history = isContinue ? messages : messages.slice(0, -1);
    const text = await streamReply(context, request.target, history, signal, write, isContinue ? CONTINUE_NUDGE : undefined);
    if (!text) restore();
  } catch (err) {
    restore();
    if (!isAbort(err)) setError(failureText(err));
  }
}

async function sendAndReply(
  request: Extract<GenerationRequest, { mode: "send" }>,
  context: GenerationContext,
  signal: AbortSignal
) {
  const { getMessages, setMessages, setError, selectedProvider, selectedModel, currentSessionId } = context;
  const { content, targets, broadcast } = request;

  const userMessage: ChatMessage | null = content
    ? {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
        targetId: broadcast ? undefined : targets[0]?.id,
      }
    : null;

  // One reply per target, or a single plain one when no character is involved.
  // Timestamps are the display order, so they mustn't tie.
  const speakers = targets.length > 0 ? targets : [undefined];
  const replies: ChatMessage[] = speakers.map((target, i) => ({
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    timestamp: new Date(Date.now() + i + 1),
    characterId: target?.id,
  }));

  await touchSession(context, content);
  setMessages((prev) => [...prev, ...(userMessage ? [userMessage] : []), ...replies]);

  // Finished replies from this send. React may not have committed them yet, and
  // the next character still needs to see them.
  const completed: ChatMessage[] = [];
  const dropReply = (id: string) => setMessages((prev) => prev.filter((m) => m.id !== id));

  for (let i = 0; i < speakers.length && !signal.aborted; i++) {
    const target = speakers[i];
    const reply = replies[i];
    const latest = [...getMessages()];
    if (userMessage && !latest.some((m) => m.id === userMessage.id)) latest.push(userMessage);
    const known = new Set(latest.map((m) => m.id));
    const pendingIds = new Set(replies.map((r) => r.id));
    const history = [
      ...latest.filter((m) => !pendingIds.has(m.id)),
      ...completed.filter((m) => !known.has(m.id) || pendingIds.has(m.id)),
    ];

    const write = (text: string) => {
      startTransitionSafe(() => {
        setMessages((prev) => prev.map((m) => (m.id === reply.id ? { ...m, content: text } : m)));
      });
    };

    try {
      const text = await streamReply(context, target, history, signal, write);
      if (!text) {
        dropReply(reply.id);
        if (!signal.aborted) setError("The model returned an empty reply.");
        continue;
      }
      completed.push({ ...reply, content: text });

      if (target && !signal.aborted) {
        const exchange = [...history.slice(-7), { ...reply, content: text }];
        setTimeout(() => {
          extractMemoriesInBackground(target, exchange, currentSessionId, selectedProvider, selectedModel).catch(() => {});
        }, 1500);
      }
    } catch (err) {
      dropReply(reply.id);
      replies.slice(i + 1).forEach((later) => dropReply(later.id));
      if (!isAbort(err)) setError(failureText(err));
      return;
    }
  }

  // Stopped before their turn came
  replies.filter((r) => !completed.some((c) => c.id === r.id)).forEach((r) => {
    setMessages((prev) => prev.filter((m) => !(m.id === r.id && m.content === "")));
  });
}

export const generateHandler = async (request: GenerationRequest, context: GenerationContext) => {
  if (!canGenerate(context)) return;

  const { abortControllerRef, setIsLoading, setError } = context;
  if (request.mode === "send" && !request.content && context.getMessages().length === 0) return;

  const controller = new AbortController();
  abortControllerRef.current = controller;
  setIsLoading(true);
  setError(null);

  try {
    if (request.mode === "send") await sendAndReply(request, context, controller.signal);
    else await rewriteLastMessage(request, context, controller.signal);
  } catch (err) {
    if (!isAbort(err)) setError(failureText(err));
  } finally {
    setIsLoading(false);
    abortControllerRef.current = null;
  }
};

/** Writes the user's next message for them. onText gets the draft as it streams in. */
export const impersonateHandler = async (
  target: Character | undefined,
  context: GenerationContext,
  onText: (text: string) => void
) => {
  if (!canGenerate(context)) return;

  const { abortControllerRef, setIsLoading, setError, getMessages, persona } = context;
  const userName = resolveUserName(persona);
  const nudge = applyMacros(IMPERSONATE_NUDGE, { charName: target?.name, userName });
  const namePrefix = new RegExp(`^\\s*${userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*`, "i");

  const controller = new AbortController();
  abortControllerRef.current = controller;
  setIsLoading(true);
  setError(null);

  try {
    await streamReply(context, target, getMessages(), controller.signal, (text) => onText(text.replace(namePrefix, "")), nudge);
  } catch (err) {
    if (!isAbort(err)) setError(failureText(err));
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
