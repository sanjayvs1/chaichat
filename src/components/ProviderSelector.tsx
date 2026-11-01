import { Cloud, Monitor, Network, Settings2 } from 'lucide-react'
import type { AIProvider, ConnectionScope, LLMConnection } from '../types/chat'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './ui/select'

const MANAGE_VALUE = '__manage__'

interface ProviderSelectorProps {
  connections: LLMConnection[]
  selectedProvider: AIProvider
  onProviderChange: (provider: AIProvider) => void
  onManage: () => void
  disabled?: boolean
}

export function ConnectionScopeIcon({ scope }: { scope: ConnectionScope }) {
  if (scope === 'device') return <Monitor className="h-4 w-4 shrink-0" />
  if (scope === 'network') return <Network className="h-4 w-4 shrink-0" />
  return <Cloud className="h-4 w-4 shrink-0" />
}

export function ProviderSelector({ connections, selectedProvider, onProviderChange, onManage, disabled }: ProviderSelectorProps) {
  const selected = connections.find((c) => c.id === selectedProvider)

  const handleChange = (value: string) => {
    if (value === MANAGE_VALUE) onManage()
    else onProviderChange(value)
  }

  return (
    <Select value={selected?.id ?? ''} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger className="w-full sm:w-44 h-8 text-sm" aria-label="Select connection">
        <SelectValue placeholder="Add connection">
          {selected && (
            <div className="flex items-center space-x-2 min-w-0">
              <ConnectionScopeIcon scope={selected.scope} />
              <span className="truncate">{selected.name}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {connections.map((connection) => (
          <SelectItem key={connection.id} value={connection.id} className="text-sm">
            <div className="flex items-center space-x-2">
              <ConnectionScopeIcon scope={connection.scope} />
              <span>{connection.name}</span>
            </div>
          </SelectItem>
        ))}
        {connections.length > 0 && <SelectSeparator />}
        <SelectItem value={MANAGE_VALUE} className="text-sm">
          <div className="flex items-center space-x-2">
            <Settings2 className="h-4 w-4" />
            <span>Manage connections</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
