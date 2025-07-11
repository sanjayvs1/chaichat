import { HardDrive, Server } from 'lucide-react'
import type { OllamaModel } from '../types/ollama'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Badge } from './ui/badge'

interface ModelSelectorProps {
  models: OllamaModel[]
  selectedModel: string
  onModelChange: (model: string) => void
  loading?: boolean
}

export function ModelSelector({ models, selectedModel, onModelChange, loading }: ModelSelectorProps) {
  const formatModelSize = (size: number) => {
    const gb = size / 1024 / 1024 / 1024
    return `${gb.toFixed(1)}GB`
  }

  const getModelIcon = (modelName: string) => {
    if (modelName.includes('gemma') || modelName.includes('llama')) {
      return <Server className="h-4 w-4" />
    }
    return <HardDrive className="h-4 w-4" />
  }

  if (loading) {
    return (
      <div className="flex h-9 w-48 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
        <span className="text-muted-foreground">Loading models...</span>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (models.length === 0) {
    return (
      <div className="flex h-9 w-48 items-center justify-between rounded-md border border-destructive bg-background px-3 py-2 text-sm">
        <span className="text-destructive text-xs">No models</span>
        <Server className="h-4 w-4 text-destructive" />
      </div>
    )
  }

  return (
    <Select value={selectedModel} onValueChange={onModelChange}>
      <SelectTrigger className="w-48 h-9">
        <SelectValue placeholder="Select model">
          {selectedModel && (
            <div className="flex items-center space-x-2">
              {getModelIcon(selectedModel)}
              <span className="truncate">{selectedModel}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={model.name} value={model.name}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-2">
                {getModelIcon(model.name)}
                <span>{model.name}</span>
              </div>
              <Badge variant="outline" className="ml-auto text-xs">
                {formatModelSize(model.size)}
              </Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
} 