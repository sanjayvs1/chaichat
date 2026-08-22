import { useState } from 'react'
import { Eye, EyeOff, Key, Save, Monitor, Cpu } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { GroqService } from '../services/groq'
import { LMStudioService } from '../services/lmstudio'
import { OllamaService } from '../services/ollama'

interface ApiKeyManagerProps {
  onApiKeySet?: () => void
}

export function ApiKeyManager({ onApiKeySet }: ApiKeyManagerProps) {
  const [apiKey, setApiKey] = useState(GroqService.getApiKey() || '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [lmStudioUrl, setLmStudioUrl] = useState(LMStudioService.getBaseUrl())
  const [ollamaUrl, setOllamaUrl] = useState(OllamaService.getBaseUrl())

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setMessage('Please enter a valid API key')
      return
    }

    setIsSaving(true)
    setMessage('')

    try {
      GroqService.setApiKey(apiKey.trim())
      
      // Test the API key by checking health
      const isValid = await GroqService.checkHealth()
      
      if (isValid) {
        setMessage('API key saved and validated successfully!')
        onApiKeySet?.()
      } else {
        setMessage('API key saved but validation failed. Please check your key.')
      }
    } catch {
      setMessage('Failed to validate API key. Please check your key.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = () => {
    setApiKey('')
    GroqService.setApiKey('')
    setMessage('API key cleared')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Key className="h-4 w-4" />
        <h3 className="text-sm font-medium">Groq API Key</h3>
      </div>
      
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Groq API key..."
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving || !apiKey.trim()}
            size="sm"
            className="flex items-center gap-1"
          >
            <Save className="h-3 w-3" />
            Save
          </Button>
        </div>

        {apiKey && (
          <Button
            onClick={handleClear}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            Clear API Key
          </Button>
        )}

        {message && (
          <p className={`text-xs ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </p>
        )}

        <div className="text-xs text-muted-foreground">
          <p>Get your API key from{' '}
            <a 
              href="https://console.groq.com/keys" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Groq Console
            </a>
          </p>
          <p className="mt-1">Your API key is stored locally in your browser.</p>
        </div>
      </div>

      {/* Local server URLs */}
      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Local servers</h3>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" />
            Ollama server URL
          </div>
          <div className="flex gap-2">
            <Input
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://127.0.0.1:11434"
              className="text-sm h-8"
            />
            <Button
              onClick={async () => {
                OllamaService.setBaseUrl(ollamaUrl)
                const ok = await OllamaService.checkHealth()
                setMessage(ok ? 'Ollama URL saved and connected!' : 'Saved, but could not reach Ollama.')
                if (ok) onApiKeySet?.()
              }}
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
            >
              <Save className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Monitor className="h-3.5 w-3.5" />
            LM Studio server URL
          </div>
          <div className="flex gap-2">
            <Input
              value={lmStudioUrl}
              onChange={(e) => setLmStudioUrl(e.target.value)}
              placeholder="http://127.0.0.1:1234"
              className="text-sm h-8"
            />
            <Button
              onClick={async () => {
                LMStudioService.setBaseUrl(lmStudioUrl)
                const ok = await LMStudioService.checkHealth()
                setMessage(ok ? 'LM Studio URL saved and connected!' : 'Saved, but could not reach LM Studio. Start the server in the Developer tab.')
                if (ok) onApiKeySet?.()
              }}
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
            >
              <Save className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            In LM Studio: open the Developer tab, load a model and click Start Server.
          </p>
        </div>
      </div>
    </div>
  )
}
