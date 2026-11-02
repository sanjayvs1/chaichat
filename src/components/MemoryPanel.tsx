import { useEffect, useState } from 'react'
import { BookOpenText, ChevronRight, Loader2, Search, StickyNote, X } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { formatTokens } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import type { AppSettings, ChatSession, PromptReport } from '../types/chat'

interface MemoryPanelProps {
  session?: ChatSession
  report: PromptReport | null
  settings: AppSettings
  unsummarized: number
  isSummarizing: boolean
  error: string | null
  canUseModel: boolean
  focusNote: number
  onClose: () => void
  onSummarize: () => void
  onSessionChange: (updates: Partial<ChatSession>) => void
  onSettingsChange: (update: (previous: AppSettings) => AppSettings) => void
}

const SECTION_COLORS = [65, 25, 165, 285, 215, 340, 110, 0]

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted-foreground/30')}
    >
      <span className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
    </button>
  )
}

function Section({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b p-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="flex-1 text-sm font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** What's in the model's head for this chat, and the controls for it. */
export function MemoryPanel({
  session,
  report,
  settings,
  unsummarized,
  isSummarizing,
  error,
  canUseModel,
  focusNote,
  onClose,
  onSummarize,
  onSessionChange,
  onSettingsChange,
}: MemoryPanelProps) {
  const [summary, setSummary] = useState(session?.summary ?? '')
  const [note, setNote] = useState(session?.authorNote ?? '')
  const noteRef = useFocusOn(focusNote)

  // Swapping chats, or a fresh summary coming back from the model
  useEffect(() => setSummary(session?.summary ?? ''), [session?.id, session?.summary])
  useEffect(() => setNote(session?.authorNote ?? ''), [session?.id, session?.authorNote])

  const used = report ? Math.min(report.totalTokens / report.budget, 1) : 0

  return (
    <div className="flex h-full w-80 flex-col border-l bg-sidebar">
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b px-4">
        <h2 className="font-display text-lg font-medium">Memory</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Close memory panel" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <p className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">{error}</p>}

        <section className="space-y-2 border-b p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium">Context</h3>
            {report && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatTokens(report.totalTokens)} / {formatTokens(report.budget)}
              </span>
            )}
          </div>

          {report ? (
            <>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(used * 100)} percent of the context budget in use`}>
                {report.sections.map((section, index) => (
                  <span
                    key={section.label}
                    style={{
                      width: `${(section.tokens / Math.max(report.totalTokens, report.budget)) * 100}%`,
                      background: `oklch(0.72 0.12 ${SECTION_COLORS[index % SECTION_COLORS.length]})`,
                    }}
                  />
                ))}
              </div>
              <ul className="space-y-0.5 text-xs">
                {report.sections.map((section, index) => (
                  <li key={section.label} className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `oklch(0.72 0.12 ${SECTION_COLORS[index % SECTION_COLORS.length]})` }} />
                    <span className="min-w-0 flex-1 truncate">{section.label}</span>
                    <span className="tabular-nums">{formatTokens(section.tokens)}</span>
                  </li>
                ))}
              </ul>
              {report.historyIncluded < report.historyTotal && (
                <p className="text-xs text-muted-foreground">
                  {report.historyTotal - report.historyIncluded} older messages no longer fit.
                  {!settings.summary.enabled && !settings.vectors.enabled && ' Turn on a summary or recall to keep them in mind.'}
                </p>
              )}
              <details className="group">
                <summary className="flex list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" /> Exact prompt
                </summary>
                <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                  {report.messages.map((message, index) => (
                    <div key={index} className="rounded-md bg-muted/60 p-2">
                      <div className="eyebrow mb-0.5">{message.role}</div>
                      <pre className="font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">{message.content}</pre>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
          )}
        </section>

        <Section
          title="Summary"
          icon={<BookOpenText className="h-4 w-4" />}
          action={
            <Toggle
              label="Summarize automatically"
              checked={settings.summary.enabled}
              onChange={(enabled) => onSettingsChange((p) => ({ ...p, summary: { ...p.summary, enabled } }))}
            />
          }
        >
          <p className="text-xs text-muted-foreground">
            {settings.summary.enabled
              ? `Updates every ${settings.summary.everyMessages} messages, so long chats keep their story.`
              : 'Keep a running recap of the story in the prompt.'}
          </p>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={() => summary !== (session?.summary ?? '') && onSessionChange({ summary })}
            rows={6}
            placeholder="No summary yet."
            className="resize-y bg-background text-xs"
            aria-label="Chat summary"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{unsummarized} messages since the last one</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={isSummarizing || !canUseModel} onClick={onSummarize}>
              {isSummarizing && <Loader2 className="h-3 w-3 animate-spin" />}
              {isSummarizing ? 'Summarizing' : 'Summarize now'}
            </Button>
          </div>
        </Section>

        <Section
          title="Recall"
          icon={<Search className="h-4 w-4" />}
          action={
            <Toggle
              label="Recall older messages"
              checked={settings.vectors.enabled}
              onChange={(enabled) => onSettingsChange((p) => ({ ...p, vectors: { ...p.vectors, enabled } }))}
            />
          }
        >
          <p className="text-xs text-muted-foreground">
            Finds older messages related to what's being said and slips them back into the prompt.
            {settings.vectors.enabled && !settings.vectors.model && ' Using built-in keyword matching. Choose an embedding model in Settings for matching by meaning.'}
          </p>
          {report && report.recalled > 0 && (
            <p className="text-xs text-foreground">{report.recalled} recalled for the last reply.</p>
          )}
        </Section>

        <Section title="Author's note" icon={<StickyNote className="h-4 w-4" />}>
          <p className="text-xs text-muted-foreground">A standing direction for this chat, kept close to the latest messages.</p>
          <Textarea
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (session?.authorNote ?? '') && onSessionChange({ authorNote: note })}
            rows={3}
            placeholder="The storm reaches the village tonight."
            className="resize-y bg-background text-xs"
            aria-label="Author's note"
          />
        </Section>
      </div>
    </div>
  )
}

function useFocusOn(signal: number) {
  const [element, setElement] = useState<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    if (signal > 0) element?.focus()
  }, [signal, element])
  return setElement
}
