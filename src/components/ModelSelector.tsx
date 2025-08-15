import { HardDrive, Server, Bot } from 'lucide-react'
import type { AIModel } from '../types/ollama'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Badge } from './ui/badge'

interface ModelSelectorProps {
  models: AIModel[]
  selectedModel: string
  onModelChange: (model: string) => void
  loading?: boolean
}

export function ModelSelector({ models, selectedModel, onModelChange, loading }: ModelSelectorProps) {
  const formatModelSize = (size: number) => {
    const gb = size / 1024 / 1024 / 1024
    return `${gb.toFixed(1)}GB`
  }

  const getModelIcon = (model: AIModel) => {
    if (model.provider === 'groq') {
      return <Bot className="h-4 w-4 text-purple-600" />
    }
    if (model.name.includes('gemma') || model.name.includes('llama')) {
      return <Server className="h-4 w-4" />
    }
    return <HardDrive className="h-4 w-4" />
  }

  const getProviderBadge = (model: AIModel) => {
    return (
      <Badge 
        variant="outline" 
        className={`ml-2 text-xs ${
          model.provider === 'groq' 
            ? 'border-purple-200 text-purple-700 bg-purple-50' 
            : 'border-blue-200 text-blue-700 bg-blue-50'
        }`}
      >
        {model.provider.toUpperCase()}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex h-8 w-44 items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm">
        <span className="text-muted-foreground">Loading...</span>
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (models.length === 0) {
    return (
      <div className="flex h-8 w-44 items-center justify-between rounded-md border border-destructive bg-background px-3 py-1 text-sm">
        <span className="text-destructive text-xs">No models</span>
        <Server className="h-4 w-4 text-destructive" />
      </div>
    )
  }

  return (
    <Select value={selectedModel} onValueChange={onModelChange}>
      <SelectTrigger className="w-full sm:w-44 h-8 text-sm" aria-label="Select AI model">
        <SelectValue placeholder="Select model">
          {selectedModel && (
            <div className="flex items-center space-x-2">
              {(() => {
                const model = models.find(m => m.name === selectedModel);
                return model ? getModelIcon(model) : <HardDrive className="h-4 w-4" />;
              })()}
              <span className="truncate">{selectedModel}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={`${model.provider}-${model.name}`} value={model.name} className="text-sm">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-2">
                {getModelIcon(model)}
                <span>{model.name}</span>
                {getProviderBadge(model)}
              </div>
              {model.provider === 'ollama' && 'size' in model && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {formatModelSize(model.size)}
                </Badge>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
} 