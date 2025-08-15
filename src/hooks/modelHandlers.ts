import type { AIModel, AIProvider, ProviderStatus } from "../types/ollama";
import { OllamaService } from "../services/ollama";
import { GroqService } from "../services/groq";

export interface ModelHandlerParams {
  setModels: React.Dispatch<React.SetStateAction<AIModel[]>>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  setSelectedProvider: React.Dispatch<React.SetStateAction<AIProvider>>;
  setIsModelsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setProviderStatus: React.Dispatch<React.SetStateAction<ProviderStatus>>;
  setIsOllamaConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setLastUsedModels: React.Dispatch<React.SetStateAction<{ollama?: string, groq?: string}>>;
  selectedModel: string;
  selectedProvider: AIProvider;
  lastUsedModels: {ollama?: string, groq?: string};
  isInitialized: boolean;
}

export const checkConnectionsHandler = async (
  setIsOllamaConnected: React.Dispatch<React.SetStateAction<boolean>>,
  setProviderStatus: React.Dispatch<React.SetStateAction<ProviderStatus>>
) => {
  const [ollamaConnected, groqConnected] = await Promise.all([
    OllamaService.checkHealth(),
    GroqService.checkHealth()
  ]);
  
  setIsOllamaConnected(ollamaConnected);
  setProviderStatus({
    ollama: ollamaConnected,
    groq: groqConnected
  });
};

export const loadModelsHandler = async (params: ModelHandlerParams) => {
  const {
    setModels,
    setSelectedModel,
    setSelectedProvider,
    setIsModelsLoading,
    setError,
    setProviderStatus,
    setIsOllamaConnected,
    selectedModel,
    lastUsedModels,
    isInitialized
  } = params;

  setIsModelsLoading(true);
  setError(null);
  
  try {
    const [ollamaConnected, groqConnected] = await Promise.all([
      OllamaService.checkHealth(),
      GroqService.checkHealth()
    ]);

    const allModels: AIModel[] = [];

    // Load Ollama models if connected
    if (ollamaConnected) {
      try {
        const response = await OllamaService.getModels();
        const ollamaModels: AIModel[] = response.models.map(model => ({
          ...model,
          provider: 'ollama' as const
        }));
        allModels.push(...ollamaModels);
      } catch (err) {
        console.error('Failed to load Ollama models:', err);
      }
    }

    // Load Groq models if connected
    if (groqConnected) {
      try {
        const groqModels = await GroqService.getModels();
        const mappedGroqModels: AIModel[] = groqModels.map(model => ({
          name: model.id,
          provider: 'groq' as const,
          id: model.id,
          object: model.object,
          created: model.created,
          owned_by: model.owned_by,
          active: model.active,
          context_window: model.context_window
        }));
        allModels.push(...mappedGroqModels);
      } catch (err) {
        console.error('Failed to load Groq models:', err);
      }
    }

    setModels(allModels);
    setProviderStatus({
      ollama: ollamaConnected,
      groq: groqConnected
    });
    setIsOllamaConnected(ollamaConnected);

    // Auto-select a good default model only if no model is currently selected
    // and we're not in the middle of initializing from a saved session
    if (allModels.length > 0 && !selectedModel && isInitialized) {
      // Try to use last used model for a connected provider first
      let modelToSelect = null;
      let providerToSelect = null;

      if (ollamaConnected && lastUsedModels.ollama) {
        const lastOllamaModel = allModels.find(m => m.name === lastUsedModels.ollama && m.provider === 'ollama');
        if (lastOllamaModel) {
          modelToSelect = lastOllamaModel.name;
          providerToSelect = 'ollama';
        }
      }
      
      if (!modelToSelect && groqConnected && lastUsedModels.groq) {
        const lastGroqModel = allModels.find(m => m.name === lastUsedModels.groq && m.provider === 'groq');
        if (lastGroqModel) {
          modelToSelect = lastGroqModel.name;
          providerToSelect = 'groq';
        }
      }

      // Fall back to default logic if no last used model found
      if (!modelToSelect) {
        // Prefer Ollama gemma2:1b if available
        const gemmaModel = allModels.find((m) => m.name === "gemma2:1b" && m.provider === 'ollama');
        if (gemmaModel) {
          modelToSelect = "gemma2:1b";
          providerToSelect = 'ollama';
        } else if (ollamaConnected) {
          // If Ollama is connected, prefer it
          const ollamaModels = allModels.filter(m => m.provider === 'ollama');
          if (ollamaModels.length > 0) {
            modelToSelect = ollamaModels[0].name;
            providerToSelect = 'ollama';
          }
        } else if (groqConnected) {
          // Otherwise use Groq
          const groqModels = allModels.filter(m => m.provider === 'groq');
          if (groqModels.length > 0) {
            modelToSelect = groqModels[0].name;
            providerToSelect = 'groq';
          }
        }
      }

      if (modelToSelect && providerToSelect) {
        setSelectedModel(modelToSelect);
        setSelectedProvider(providerToSelect as AIProvider);
        console.log(`Auto-selected ${providerToSelect} model: ${modelToSelect}`);
      }
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to load models");
  } finally {
    setIsModelsLoading(false);
  }
};

export const handleModelChangeHandler = (
  model: string,
  selectedProvider: AIProvider,
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>,
  setLastUsedModels: React.Dispatch<React.SetStateAction<{ollama?: string, groq?: string}>>
) => {
  setSelectedModel(model);
  // Update last used model for current provider
  setLastUsedModels(prev => ({
    ...prev,
    [selectedProvider]: model
  }));
  console.log(`Updated last used model for ${selectedProvider}:`, model);
};

export const handleProviderChangeHandler = (
  newProvider: AIProvider,
  lastUsedModels: {ollama?: string, groq?: string},
  models: AIModel[],
  setSelectedProvider: React.Dispatch<React.SetStateAction<AIProvider>>,
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>
) => {
  // Always reset Groq client when changing providers to prevent context bleeding
  GroqService.resetClient();
  
  setSelectedProvider(newProvider);
  
  // Try to select the last used model for this provider
  const lastUsedModel = lastUsedModels[newProvider];
  if (lastUsedModel) {
    const availableModel = models.find(m => m.name === lastUsedModel && m.provider === newProvider);
    if (availableModel) {
      setSelectedModel(lastUsedModel);
      console.log(`Restored last used model for ${newProvider}:`, lastUsedModel);
      return;
    }
  }
  
  // Fall back to first available model for this provider
  const providerModels = models.filter(m => m.provider === newProvider);
  if (providerModels.length > 0) {
    setSelectedModel(providerModels[0].name);
    console.log(`Selected default model for ${newProvider}:`, providerModels[0].name);
  }
};
