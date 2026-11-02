import type { AIProvider, AppSettings, Character, ChatMessage, VectorMatch } from "../types/chat";
import { completeChat } from "../services/llm";
import { estimateTokens } from "../lib/tokens";

// The newest turns stay out of the summary, they're in the prompt word for word anyway
const SUMMARY_KEEP_RECENT = 6;
const SUMMARY_PARAMS = { temperature: 0.3 };
// Below this a message says too little to search on ("why?"), so the end of the one before helps
const RECALL_MIN_QUERY_CHARS = 24;
const RECALL_CONTEXT_CHARS = 300;

const speakerOf = (message: ChatMessage, characters: Character[], userName: string) =>
  message.role === "user"
    ? userName
    : (characters.find((c) => c.id === message.characterId)?.name ?? "Assistant");

export function unsummarizedCount(messages: ChatMessage[], summaryThroughId?: string): number {
  const covered = summaryThroughId ? messages.findIndex((m) => m.id === summaryThroughId) + 1 : 0;
  return messages.length - covered;
}

export function shouldSummarize(
  messages: ChatMessage[],
  summaryThroughId: string | undefined,
  settings: AppSettings["summary"]
): boolean {
  if (!settings.enabled) return false;
  return unsummarizedCount(messages, summaryThroughId) >= settings.everyMessages + SUMMARY_KEEP_RECENT;
}

export interface SummaryRequest {
  messages: ChatMessage[];
  summary?: string;
  summaryThroughId?: string;
  settings: AppSettings["summary"];
  characters: Character[];
  userName: string;
  provider: AIProvider;
  model: string;
}

/**
 * Folds everything since the last summary into a new one. Passing the old summary in,
 * rather than resummarizing the whole chat, keeps the request small however long the chat gets.
 * Returns null when there's nothing new to cover.
 */
export async function summarizeChat(request: SummaryRequest) {
  const { messages, summary, summaryThroughId, settings, characters, userName, provider, model } = request;

  const covered = summaryThroughId ? messages.findIndex((m) => m.id === summaryThroughId) + 1 : 0;
  const end = Math.max(covered, messages.length - SUMMARY_KEEP_RECENT);
  const fresh = messages.slice(covered, end).filter((m) => m.content.trim());
  if (fresh.length === 0) return null;

  const transcript = fresh
    .map((m) => `${speakerOf(m, characters, userName)}: ${m.content}`)
    .join("\n\n");
  const instructions = `${settings.prompt.trim()}\nUse at most ${settings.maxWords} words.`;

  const text = await completeChat(
    provider,
    model,
    [
      { role: "system", content: instructions },
      {
        role: "user",
        content: summary?.trim()
          ? `Summary so far:\n${summary.trim()}\n\nWhat happened next:\n${transcript}\n\nWrite the updated summary.`
          : `${transcript}\n\nWrite the summary.`,
      },
    ],
    SUMMARY_PARAMS
  );

  const cleaned = text.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "").trim();
  if (!cleaned) throw new Error("The model returned an empty summary.");
  return { summary: cleaned, summaryThroughId: fresh[fresh.length - 1].id };
}

function vectorApi() {
  return window.electronAPI.vectors;
}

/** Messages that will be in the prompt anyway, so recalling them would only repeat them. */
function messagesInWindow(messages: ChatMessage[], budget: number): string[] {
  const ids: string[] = [];
  let remaining = budget;
  for (let i = messages.length - 1; i >= 0; i--) {
    remaining -= estimateTokens(messages[i].content);
    if (remaining < 0) break;
    ids.push(messages[i].id);
  }
  return ids;
}

// The latest message alone, otherwise a long reply just before a short question drowns it out
function recallQuery(spoken: ChatMessage[]): string {
  const latest = spoken[spoken.length - 1]?.content ?? "";
  if (latest.length >= RECALL_MIN_QUERY_CHARS) return latest;
  const previous = spoken[spoken.length - 2]?.content ?? "";
  return `${previous.slice(-RECALL_CONTEXT_CHARS)}\n${latest}`.trim();
}

export interface RecallRequest {
  sessionId: string;
  messages: ChatMessage[];
  target?: Character;
  settings: AppSettings["vectors"];
  budget: number;
}

export async function recallMessages(request: RecallRequest): Promise<VectorMatch[]> {
  const { sessionId, messages, target, settings, budget } = request;
  if (!settings.enabled) return [];

  const source = { connectionId: settings.connectionId, model: settings.model };
  const spoken = messages.filter((m) => m.content.trim());
  const query = recallQuery(spoken);
  if (!query) return [];

  const synced = await vectorApi().sync({
    sessionId,
    messages: spoken.map(({ id, content }) => ({ id, content })),
    source,
  });
  if (!synced.ok) throw new Error(synced.error);

  const excludeIds = messagesInWindow(spoken, budget);
  // In a single chat there's nothing to recall until history falls out of the window
  if (settings.scope === "chat" && excludeIds.length >= spoken.length) return [];

  const result = await vectorApi().query({
    sessionId,
    characterId: target?.id,
    scope: settings.scope,
    text: query,
    topK: settings.topK,
    excludeIds,
    source,
  });
  if (!result.ok) throw new Error(result.error);
  return result.matches;
}
