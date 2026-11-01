import { useState } from 'react'
import { ArrowLeft, Eye, EyeOff, Lock, Pencil, Plug, Plus, Radar, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ConnectionScopeIcon } from './ProviderSelector'
import { LLMService } from '../services/llm'
import type {
  AIProvider,
  ConnectionInput,
  ConnectionPreset,
  ConnectionScope,
  LLMConnection,
  ProviderStatus,
} from '../types/chat'

interface ConnectionManagerProps {
  connections: LLMConnection[]
  presets: ConnectionPreset[]
  selectedProvider: AIProvider
  providerStatus: ProviderStatus
  encryptionAvailable: boolean
  autoConnect: boolean
  onAutoConnectChange: (enabled: boolean) => void
  onChanged: (selectId?: AIProvider) => Promise<void>
}

type View = { mode: 'list' } | { mode: 'pick' } | { mode: 'form'; preset: ConnectionPreset; connection?: LLMConnection }
type Feedback = { ok: boolean; text: string }

const SCOPE_LABELS: Record<ConnectionScope, string> = {
  device: 'Stays on this computer',
  network: 'Stays on your network',
  cloud: 'Messages are sent to this provider',
}

function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

function keySummary(connection: LLMConnection) {
  const suffix = connection.keyHint ? ` ending ${connection.keyHint}` : ''
  switch (connection.keyState) {
    case 'saved':
      return `Key${suffix} saved`
    case 'session':
      return `Key${suffix} until you quit`
    case 'unreadable':
      return 'Saved key unreadable, enter it again'
    default:
      return null
  }
}

function isInsecureRemote(baseUrl: string) {
  try {
    const url = new URL(baseUrl.includes('://') ? baseUrl : `http://${baseUrl}`)
    return url.protocol === 'http:' && !/^(localhost|127\.|\[::1\])/.test(url.host)
  } catch {
    return false
  }
}

export function ConnectionManager({
  connections,
  presets,
  selectedProvider,
  providerStatus,
  encryptionAvailable,
  autoConnect,
  onAutoConnectChange,
  onChanged,
}: ConnectionManagerProps) {
  const [view, setView] = useState<View>({ mode: 'list' })
  const [pendingDelete, setPendingDelete] = useState<AIProvider | null>(null)
  const [confirmForget, setConfirmForget] = useState(false)
  const [notice, setNotice] = useState('')

  const presetOf = (connection: LLMConnection) =>
    presets.find((p) => p.id === connection.presetId) ?? presets[presets.length - 1]

  const handleDelete = async (id: AIProvider) => {
    if (pendingDelete !== id) {
      setPendingDelete(id)
      return
    }
    setPendingDelete(null)
    await LLMService.deleteConnection(id)
    await onChanged()
  }

  const handleForgetAll = async () => {
    if (!confirmForget) {
      setConfirmForget(true)
      return
    }
    setConfirmForget(false)
    await LLMService.forgetAllKeys()
    await onChanged(selectedProvider || undefined)
    setNotice('All saved API keys were removed.')
  }

  if (view.mode === 'pick') {
    return (
      <div className="space-y-4">
        <Heading title="Add a connection" onBack={() => setView({ mode: 'list' })} />
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setView({ mode: 'form', preset })}
              className={`rounded-md border p-3 text-left text-sm hover:bg-muted/60 transition-colors ${preset.description ? 'col-span-2' : ''}`}
            >
              <div className="font-medium">{preset.name}</div>
              {preset.description && <div className="text-xs text-muted-foreground">{preset.description}</div>}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (view.mode === 'form') {
    return (
      <ConnectionForm
        key={view.connection?.id ?? view.preset.id}
        preset={view.preset}
        connection={view.connection}
        encryptionAvailable={encryptionAvailable}
        onBack={() => setView({ mode: 'list' })}
        onSaved={async (id, message) => {
          await onChanged(id)
          setNotice(message)
          setView({ mode: 'list' })
        }}
      />
    )
  }

  const hasStoredKeys = connections.some((c) => c.keyState !== 'none')

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 pr-6">
        <Plug className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Connections</h2>
        <Button size="sm" variant="outline" className="ml-auto h-8" onClick={() => setView({ mode: 'pick' })}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No connections yet. Add a local server or a cloud provider to start chatting.
        </p>
      ) : (
        <ul className="space-y-2">
          {connections.map((connection) => {
            const isSelected = connection.id === selectedProvider
            const summary = keySummary(connection)
            return (
              <li key={connection.id} className="flex items-center gap-3 rounded-md border p-3">
                <ConnectionScopeIcon scope={connection.scope} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{connection.name}</span>
                    {isSelected && (
                      <span className={`text-xs font-normal ${providerStatus[connection.id] ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {providerStatus[connection.id] ? 'Connected' : 'Selected'}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {hostOf(connection.baseUrl)} · {SCOPE_LABELS[connection.scope]}
                  </div>
                  {summary && <div className="text-xs text-muted-foreground">{summary}</div>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={`Edit ${connection.name}`}
                  onClick={() => setView({ mode: 'form', preset: presetOf(connection), connection })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={pendingDelete === connection.id ? 'destructive' : 'ghost'}
                  size="sm"
                  className={pendingDelete === connection.id ? 'h-8 px-2 text-xs' : 'h-8 w-8 p-0'}
                  aria-label={`Delete ${connection.name}`}
                  onBlur={() => setPendingDelete(null)}
                  onClick={() => handleDelete(connection.id)}
                >
                  {pendingDelete === connection.id ? 'Delete?' : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}

      <div className="space-y-3 border-t pt-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={autoConnect}
            onChange={(e) => onAutoConnectChange(e.target.checked)}
          />
          <span>
            Reconnect automatically
            <span className="block text-xs text-muted-foreground">
              Opens your last connection and model on startup, and uses another saved connection if it's offline.
            </span>
          </span>
        </label>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            {encryptionAvailable
              ? 'API keys are encrypted with your operating system account and are only sent to the server they were entered for. They cannot be viewed again after saving.'
              : "This computer has no secure key storage, so API keys are kept in memory and forgotten when you quit."}
          </p>
        </div>

        {hasStoredKeys && (
          <Button
            variant={confirmForget ? 'destructive' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onBlur={() => setConfirmForget(false)}
            onClick={handleForgetAll}
          >
            {confirmForget ? 'Remove every key?' : 'Forget all API keys'}
          </Button>
        )}
      </div>
    </div>
  )
}

function Heading({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 pr-6">
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Back to connections" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  )
}

interface ConnectionFormProps {
  preset: ConnectionPreset
  connection?: LLMConnection
  encryptionAvailable: boolean
  onBack: () => void
  onSaved: (id: AIProvider, message: string) => Promise<void>
}

function ConnectionForm({ preset, connection, encryptionAvailable, onBack, onSaved }: ConnectionFormProps) {
  const [name, setName] = useState(connection?.name ?? preset.name)
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? preset.baseUrl)
  const [defaultModel, setDefaultModel] = useState(connection?.defaultModel ?? '')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [clearKey, setClearKey] = useState(false)
  const [rememberKey, setRememberKey] = useState(true)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState<'test' | 'detect' | 'save' | null>(null)
  const [detected, setDetected] = useState<Array<{ baseUrl: string; modelCount: number }> | null>(null)

  const hasStoredKey = !!connection && connection.keyState !== 'none' && !clearKey
  const canSave = !busy && (!preset.editableUrl || !!baseUrl.trim()) && (!preset.needsKey || !!apiKey.trim() || hasStoredKey)
  const showModelField = !!preset.editableUrl
  const urlChangedWithKey =
    hasStoredKey && !apiKey.trim() && hostOf(baseUrl) !== hostOf(connection.baseUrl)

  const toInput = (): ConnectionInput => ({
    id: connection?.id,
    presetId: preset.id,
    name,
    baseUrl,
    defaultModel,
    apiKey,
    clearKey,
    rememberKey,
  })

  const handleTest = async () => {
    setBusy('test')
    setFeedback(null)
    const result = await LLMService.testConnection(toInput())
    setFeedback(
      result.ok
        ? { ok: true, text: `Connected. ${result.modelCount} model${result.modelCount === 1 ? '' : 's'} available.` }
        : { ok: false, text: result.error }
    )
    setBusy(null)
  }

  const handleDetect = async () => {
    setBusy('detect')
    setFeedback(null)
    const servers = await LLMService.detectLocalServers()
    setDetected(servers)
    if (servers.length === 1) setBaseUrl(servers[0].baseUrl)
    setBusy(null)
  }

  const handleSave = async () => {
    setBusy('save')
    setFeedback(null)
    const result = await LLMService.saveConnection(toInput())
    if (!result.ok) {
      setFeedback({ ok: false, text: result.error })
      setBusy(null)
      return
    }
    await onSaved(
      result.connection.id,
      result.keyCleared ? `${result.connection.name} was saved and its API key was removed.` : `${result.connection.name} was saved.`
    )
  }

  return (
    <div className="space-y-4">
      <Heading title={connection ? `Edit ${connection.name}` : preset.name} onBack={onBack} />

      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={preset.name} className="h-9 text-sm" />
      </Field>

      {preset.editableUrl && (
        <Field label="Server URL">
          <div className="flex gap-2">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://127.0.0.1:8080/v1"
              className="h-9 text-sm"
            />
            {preset.id === 'local' && (
              <Button variant="outline" size="sm" className="h-9 shrink-0" disabled={!!busy} onClick={handleDetect}>
                <Radar className="h-3.5 w-3.5" />
                {busy === 'detect' ? 'Looking...' : 'Find'}
              </Button>
            )}
          </div>
          {detected?.length === 0 && (
            <p className="text-xs text-muted-foreground">No running servers found on the usual ports.</p>
          )}
          {detected && detected.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {detected.map((server) => (
                <Button
                  key={server.baseUrl}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setBaseUrl(server.baseUrl)}
                >
                  {hostOf(server.baseUrl)} ({server.modelCount})
                </Button>
              ))}
            </div>
          )}
          {isInsecureRemote(baseUrl) && (
            <p className="text-xs text-amber-600">
              This address isn't encrypted, so messages and any API key can be read on the network.
            </p>
          )}
        </Field>
      )}

      <Field label={preset.needsKey ? 'API key' : 'API key (optional)'}>
        <div className="relative">
          <Input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasStoredKey
                ? `Leave blank to keep the current key${connection.keyHint ? ` (ends ${connection.keyHint})` : ''}`
                : 'Paste your API key'
            }
            autoComplete="off"
            spellCheck={false}
            className="h-9 pr-10 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          {preset.keyUrl ? (
            <a href={preset.keyUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Get an API key
            </a>
          ) : (
            <span />
          )}
          {hasStoredKey && (
            <button type="button" className="hover:underline" onClick={() => setClearKey(true)}>
              Remove saved key
            </button>
          )}
          {clearKey && <span>The key will be removed when you save.</span>}
        </div>
        {urlChangedWithKey && (
          <p className="text-xs text-amber-600">
            The saved key won't follow this URL change. Enter a key for the new server, or save without one.
          </p>
        )}
        {apiKey.trim() && encryptionAvailable && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} />
            Remember this key after I quit
          </label>
        )}
      </Field>

      {showModelField && (
        <Field label="Model name (optional)">
          <Input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="Only needed if the server doesn't list its models"
            className="h-9 text-sm"
          />
        </Field>
      )}

      {feedback && (
        <p className={`text-xs ${feedback.ok ? 'text-emerald-600' : 'text-destructive'}`}>{feedback.text}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-9" disabled={!!busy} onClick={handleTest}>
          {busy === 'test' ? 'Testing...' : 'Test'}
        </Button>
        <Button size="sm" className="h-9" disabled={!canSave} onClick={handleSave}>
          {busy === 'save' ? 'Saving...' : 'Save and connect'}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}
