import { useState, useEffect, useCallback } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Play, Trash2, Search, Code2, Clock, Pencil, Check, X, Loader2 } from 'lucide-react'
import type { SavedScript, ScriptExecutionResult } from '../types/ollama'
import { dbService } from '../services/database'
import { cn } from '@/lib/utils'

export function SavedScripts() {
  const [scripts, setScripts] = useState<SavedScript[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedScript, setSelectedScript] = useState<SavedScript | null>(null)
  const [executionResult, setExecutionResult] = useState<ScriptExecutionResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState('')

  const loadScripts = useCallback(async () => {
    try {
      const all = await dbService.getAllSavedScripts()
      setScripts(all)
    } catch (err) {
      console.error('Failed to load saved scripts:', err)
    }
  }, [])

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  const filteredScripts = scripts.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleRun = async (script: SavedScript) => {
    setIsRunning(true)
    setExecutionResult(null)
    setSelectedScript(script)

    try {
      const result = await dbService.executeScript(script.code)
      setExecutionResult(result)
      await dbService.updateSavedScript(script.id, { lastRunAt: new Date().toISOString() })
      await loadScripts()
    } catch (err) {
      setExecutionResult({
        success: false,
        stdout: '',
        stderr: err instanceof Error ? err.message : 'Unknown error',
        exitCode: 1,
        timedOut: false,
      })
    } finally {
      setIsRunning(false)
    }
  }

  const handleDelete = async (scriptId: string) => {
    await dbService.deleteSavedScript(scriptId)
    if (selectedScript?.id === scriptId) {
      setSelectedScript(null)
      setExecutionResult(null)
    }
    await loadScripts()
  }

  const handleStartRename = (script: SavedScript) => {
    setEditingName(script.id)
    setEditNameValue(script.name)
  }

  const handleFinishRename = async (scriptId: string) => {
    if (editNameValue.trim()) {
      await dbService.updateSavedScript(scriptId, { name: editNameValue.trim() })
      await loadScripts()
    }
    setEditingName(null)
  }

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="flex flex-col h-[70vh]">
      <div className="flex items-center gap-2 mb-4">
        <Code2 className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Saved Scripts</h2>
        <span className="text-xs text-muted-foreground ml-auto">{scripts.length} script{scripts.length !== 1 ? 's' : ''}</span>
      </div>

      {scripts.length > 3 && (
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search scripts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Script list */}
        <ScrollArea className="w-[240px] flex-shrink-0 border rounded-md">
          <div className="p-1">
            {filteredScripts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Code2 className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">{scripts.length === 0 ? 'No saved scripts yet' : 'No matches'}</p>
                <p className="text-xs mt-1">Save a Python script from any chat response</p>
              </div>
            ) : (
              filteredScripts.map(script => (
                <div
                  key={script.id}
                  className={cn(
                    "flex flex-col gap-1 p-2 rounded-md cursor-pointer transition-colors mb-1",
                    selectedScript?.id === script.id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-muted"
                  )}
                  onClick={() => {
                    setSelectedScript(script)
                    setExecutionResult(null)
                  }}
                >
                  <div className="flex items-center justify-between">
                    {editingName === script.id ? (
                      <div className="flex items-center gap-1 flex-1 mr-1">
                        <Input
                          value={editNameValue}
                          onChange={e => setEditNameValue(e.target.value)}
                          className="h-6 text-xs px-1"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleFinishRename(script.id)
                            if (e.key === 'Escape') setEditingName(null)
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                        <button onClick={e => { e.stopPropagation(); handleFinishRename(script.id) }} className="text-emerald-500 hover:text-emerald-600">
                          <Check className="h-3 w-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setEditingName(null) }} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm font-medium truncate flex-1">{script.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{script.language}</span>
                    <span>{formatDate(script.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Script detail / execution */}
        <div className="flex-1 flex flex-col min-h-0 border rounded-md">
          {selectedScript ? (
            <>
              <div className="flex items-center justify-between p-3 border-b bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <Code2 className="h-4 w-4 flex-shrink-0 text-primary" />
                  <span className="text-sm font-medium truncate">{selectedScript.name}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 gap-1 text-xs"
                    onClick={() => handleRun(selectedScript)}
                    disabled={isRunning}
                  >
                    {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    {isRunning ? 'Running...' : 'Run'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => handleStartRename(selectedScript)}
                    title="Rename"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(selectedScript.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {selectedScript.lastRunAt && (
                <div className="flex items-center gap-1 px-3 py-1 text-[10px] text-muted-foreground border-b">
                  <Clock className="h-3 w-3" />
                  Last run: {formatDate(selectedScript.lastRunAt)}
                </div>
              )}

              <ScrollArea className="flex-1">
                <pre className="p-3 text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words">
                  {selectedScript.code}
                </pre>
              </ScrollArea>

              {/* Execution output */}
              {(executionResult || isRunning) && (
                <div className="border-t">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b">
                    <span className="text-[11px] font-medium">Output</span>
                    {executionResult && (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full",
                        executionResult.success
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-destructive/10 text-destructive"
                      )}>
                        {executionResult.timedOut
                          ? 'Timed out'
                          : executionResult.success
                            ? 'Success'
                            : `Exit code ${executionResult.exitCode}`}
                      </span>
                    )}
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    {isRunning ? (
                      <div className="flex items-center justify-center py-6 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-sm">Executing script...</span>
                      </div>
                    ) : executionResult && (
                      <pre className={cn(
                        "p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words",
                        !executionResult.success && "text-destructive"
                      )}>
                        {executionResult.stdout || executionResult.stderr || '(no output)'}
                      </pre>
                    )}
                  </ScrollArea>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
              <Code2 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Select a script to view and run it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
