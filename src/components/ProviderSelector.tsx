import { Bot, Cpu } from 'lucide-react'
import type { AIProvider } from '../types/ollama'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

interface ProviderSelectorProps {
  selectedProvider: AIProvider
  onProviderChange: (provider: AIProvider) => void
  disabled?: boolean
}

export function ProviderSelector({ selectedProvider, onProviderChange, disabled }: ProviderSelectorProps) {
  const getProviderIcon = (provider: AIProvider) => {
    switch (provider) {
      case 'ollama':
        return <Cpu className="h-4 w-4" />
      case 'groq':
        return <Bot className="h-4 w-4" />
      default:
        return <Cpu className="h-4 w-4" />
    }
  }

  const getProviderName = (provider: AIProvider) => {
    switch (provider) {
      case 'ollama':
        return 'Ollama'
      case 'groq':
        return 'Groq'
      default:
        return provider
    }
  }

  return (
    <Select value={selectedProvider} onValueChange={onProviderChange} disabled={disabled}>
      <SelectTrigger className="w-full sm:w-32 h-8 text-sm" aria-label="Select AI provider">
        <SelectValue>
          <div className="flex items-center space-x-2">
            {getProviderIcon(selectedProvider)}
            <span className="truncate">{getProviderName(selectedProvider)}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ollama" className="text-sm">
          <div className="flex items-center space-x-2">
            <Cpu className="h-4 w-4" />
            <span>Ollama</span>
          </div>
        </SelectItem>
        <SelectItem value="groq" className="text-sm">
          <div className="flex items-center space-x-2">
            <Bot className="h-4 w-4" />
            <span>Groq</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
