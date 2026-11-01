import type { AIModel, AIProvider, LLMConnection, ProviderStatus } from "../types/chat";
import { LLMService } from "../services/llm";

export type LastUsedModels = Record<AIProvider, string>;

export interface ConnectParams {
  // Bumped per attempt so a slow reply can't overwrite a newer selection
  connectAttemptRef: React.MutableRefObject<number>;
  selectedModelRef: React.MutableRefObject<string>;
  lastUsedModelsRef: React.MutableRefObject<LastUsedModels>;
  connectionsRef: React.MutableRefObject<LLMConnection[]>;
  setModels: React.Dispatch<React.SetStateAction<AIModel[]>>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  setSelectedProvider: React.Dispatch<React.SetStateAction<AIProvider>>;
  setIsModelsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setProviderStatus: React.Dispatch<React.SetStateAction<ProviderStatus>>;
  setConnectionError: React.Dispatch<React.SetStateAction<string | null>>;
  setConnectionNotice: React.Dispatch<React.SetStateAction<string | null>>;
}

// Keep the current model if it still exists, then the last used one, then the first listed
export const pickModel = (models: AIModel[], current: string, lastUsed?: string): string => {
  if (models.length === 0) return current;
  if (models.some((m) => m.name === current)) return current;
  if (lastUsed && models.some((m) => m.name === lastUsed)) return lastUsed;
  return models[0].name;
};

// Most recently used first, stopping at the first connection that answers
const findFallback = async (failedId: AIProvider, connections: LLMConnection[]) => {
  const candidates = connections
    .filter((c) => c.id !== failedId && c.keyState !== "unreadable")
    .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));

  for (const candidate of candidates) {
    const result = await LLMService.listModels(candidate.id);
    if (result.ok && result.models.length > 0) return candidate;
  }
  return null;
};

export const connectHandler = async (
  id: AIProvider,
  params: ConnectParams,
  options: { fallback?: boolean } = {}
) => {
  const {
    connectAttemptRef,
    selectedModelRef,
    lastUsedModelsRef,
    connectionsRef,
    setModels,
    setSelectedModel,
    setSelectedProvider,
    setIsModelsLoading,
    setProviderStatus,
    setConnectionError,
    setConnectionNotice,
  } = params;

  const attempt = ++connectAttemptRef.current;
  setIsModelsLoading(true);

  const result = await LLMService.listModels(id);
  if (attempt !== connectAttemptRef.current) return;

  setProviderStatus((prev) => ({ ...prev, [id]: result.ok }));

  if (result.ok) {
    setConnectionError(null);
    setModels((prev) => [...prev.filter((m) => m.provider !== id), ...result.models]);
    setSelectedModel(pickModel(result.models, selectedModelRef.current, lastUsedModelsRef.current[id]));
    setIsModelsLoading(false);
    return;
  }

  setConnectionError(result.error);

  if (options.fallback) {
    const fallback = await findFallback(id, connectionsRef.current);
    if (attempt !== connectAttemptRef.current) return;
    if (fallback) {
      const preferred = connectionsRef.current.find((c) => c.id === id);
      setConnectionNotice(
        `${preferred?.name ?? "Your last connection"} isn't reachable, so ChaiChat connected to ${fallback.name} for now.`
      );
      // Selecting it connects as usual. The remembered choice stays until the user chats.
      setSelectedProvider(fallback.id);
      return;
    }
  }

  setIsModelsLoading(false);
};

export const pickStartupConnection = (
  connections: LLMConnection[],
  ...preferredIds: Array<string | null | undefined>
): LLMConnection | undefined => {
  for (const id of preferredIds) {
    const match = connections.find((c) => c.id === id);
    if (match) return match;
  }
  return connections[0];
};
