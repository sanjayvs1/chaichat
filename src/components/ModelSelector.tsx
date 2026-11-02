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
      <div className="flex h-8 items-center px-2 text-xs text-muted-foreground">Loading models</div>
    )
  }

  if (models.length === 0) {
    return (
      <div className="flex h-8 items-center px-2 text-xs text-muted-foreground">No models</div>
    )
  }

  return (
    <Select value={selectedModel} onValueChange={onModelChange}>
      <SelectTrigger className="h-8 w-auto max-w-52 gap-1 border-0 bg-transparent px-2 text-xs shadow-none dark:bg-transparent" aria-label="Select AI model">
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
