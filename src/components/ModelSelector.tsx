import type { AIModel } from '../types/chat'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

interface ModelSelectorProps {
  models: AIModel[]
  selectedModel: string
  onModelChange: (model: string) => void
  loading?: boolean
}

export function ModelSelector({ models, selectedModel, onModelChange, loading }: ModelSelectorProps) {
  if (loading) {
    return (
      <div className="flex h-8 w-full sm:w-44 items-center rounded-md border border-input bg-background px-3 py-1 text-sm">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    )
  }

  if (models.length === 0) {
    return (
      <div className="flex h-8 w-full sm:w-44 items-center rounded-md border border-input bg-muted/40 px-3 py-1 text-sm">
        <span className="text-muted-foreground text-xs">No models available</span>
      </div>
    )
  }

  return (
    <Select value={selectedModel} onValueChange={onModelChange}>
      <SelectTrigger className="w-full sm:w-44 h-8 text-sm" aria-label="Select AI model">
        <SelectValue placeholder="Select model">
          <span className="truncate">{selectedModel}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={`${model.provider}-${model.name}`} value={model.name} className="text-sm">
            <span className="truncate">{model.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
