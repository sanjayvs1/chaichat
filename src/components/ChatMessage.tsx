import { Save, Copy, Check, CornerDownRight, ChevronLeft, ChevronRight, Pencil, RefreshCw, GitFork, Trash2, Brain } from 'lucide-react'
import { Children, cloneElement, isValidElement, memo, useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import type { Character, ChatMessage as ChatMessageType, Persona } from '../types/chat'
import { CharacterAvatar } from './CharacterAvatar'
import { nameHue } from '@/lib/cards'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
  message: ChatMessageType
  characters: Character[]
  persona?: Persona
  isStreaming?: boolean
  isLast?: boolean
  onSaveScript?: (code: string, language: string) => void
  onEditMessage?: (messageId: string, newContent: string, resend: boolean) => void
  onResendMessage?: (messageId: string) => void
  onBranchFromMessage?: (messageId: string) => void
  onDeleteMessage?: (messageId: string) => void
  onSwipe?: (messageId: string, direction: -1 | 1) => void
}

type ThinkPart = { kind: 'md' | 'think'; content: string }

function splitThinkBlocks(text: string): ThinkPart[] {
  const parts: ThinkPart[] = []
  // Matches closed think blocks (<think>, <thinking>, <thought>, <reasoning>),
  // plus an unclosed one at the end (still streaming or truncated)
  const regex = /<(think|thinking|thought|reasoning)(?:\s[^>]*)?>[\s\S]*?(?:<\/\1\s*>|$)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const start = match.index
    const inner = match[0]
      .replace(/^<(?:think|thinking|thought|reasoning)(?:\s[^>]*)?>/i, '')
      .replace(/<\/(?:think|thinking|thought|reasoning)\s*>$/i, '')
    if (start > lastIndex) parts.push({ kind: 'md', content: text.slice(lastIndex, start) })
    if (inner.trim()) parts.push({ kind: 'think', content: inner.trim() })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) parts.push({ kind: 'md', content: text.slice(lastIndex) })
  return parts
}

function extractTextContent(node: unknown): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractTextContent).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props
    if (props?.children !== undefined) return extractTextContent(props.children)
  }
  return ''
}

// Tints "spoken words" so dialogue stands apart from narration
function tintSpeech(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      return child.split(/("[^"\n]+"|“[^”\n]+”)/g).map((piece, i) =>
        i % 2 === 1 ? <span key={i} className="speech">{piece}</span> : piece
      )
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.type !== 'code' && child.props.children) {
      return cloneElement(child, undefined, tintSpeech(child.props.children))
    }
    return child
  })
}

function ToolButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        danger && 'hover:text-destructive'
      )}
    >
      {children}
    </button>
  )
}

export const ChatMessage = memo(function ChatMessage({
  message,
  characters,
  persona,
  isStreaming = false,
  isLast = false,
  onSaveScript,
  onEditMessage,
  onResendMessage,
  onBranchFromMessage,
  onDeleteMessage,
  onSwipe,
}: ChatMessageProps) {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)
  const [savedBlock, setSavedBlock] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isUser = message.role === 'user'

  const character = useMemo(() => {
    if (isUser || !message.characterId) return null
    return characters.find(c => c.id === message.characterId) || null
  }, [isUser, message.characterId, characters])

  // Who this user message was addressed to (multi-character chats)
  const targetCharacter = useMemo(() => {
    if (!isUser || !message.targetId) return null
    return characters.find(c => c.id === message.targetId) || null
  }, [isUser, message.targetId, characters])

  const sender = isUser ? persona?.name || 'You' : character?.name || 'Assistant'
  const time = useMemo(
    () => message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    [message.timestamp]
  )

  const thinkParts = useMemo(() => splitThinkBlocks(message.content), [message.content])
  const hasVisibleText = thinkParts.some(part => part.kind === 'md' && part.content.trim())

  const swipeCount = message.swipes?.length ?? 1
  const swipeIndex = message.swipeIndex ?? 0
  const canSwipe = !isUser && !isStreaming && (swipeCount > 1 || isLast)

  const handleCopyBlock = useCallback((text: string, blockId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedBlock(blockId)
      setTimeout(() => setCopiedBlock(null), 2000)
    })
  }, [])

  const handleSaveBlock = useCallback((code: string, language: string, blockId: string) => {
    onSaveScript?.(code, language)
    setSavedBlock(blockId)
    setTimeout(() => setSavedBlock(null), 2000)
  }, [onSaveScript])

  const copyMessage = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const startEditing = () => {
    setEditText(message.content)
    setIsEditing(true)
  }

  const commitEdit = (resend: boolean) => {
    const trimmed = editText.trim()
    if (!trimmed) return
    setIsEditing(false)
    onEditMessage?.(message.id, trimmed, resend)
  }

  const handleDelete = () => {
    if (confirmDelete) onDeleteMessage?.(message.id)
    else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 2500)
    }
  }

  let codeBlockIndex = 0

  const Code = ({ className, children }: { className?: string; children?: ReactNode }) => {
    const isBlock = !!className || String(children).includes('\n')
    if (!isBlock) {
      return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em]">{children}</code>
    }
    return <code className={className || ''} data-language={className?.replace('language-', '')}>{children}</code>
  }

  const Pre = ({ children }: { children?: ReactNode }) => {
    // The rendered child of a <pre> is the <code> element; peek at its props for language info
    const codeChild = (Array.isArray(children) ? children[0] : children) as
      | { props?: { className?: string; 'data-language'?: string } }
      | undefined
    const language = codeChild?.props?.['data-language'] || codeChild?.props?.className?.replace('language-', '') || ''
    const codeText = extractTextContent(children)
    const blockId = `block-${codeBlockIndex++}`
    const isPython = /^(python|py|python3)$/i.test(language)

    return (
      <div className="my-3 overflow-hidden rounded-lg border bg-card font-sans">
        <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1">
          <span className="font-mono text-[11px] text-muted-foreground">{language || 'code'}</span>
          <div className="flex items-center gap-1">
            {isPython && onSaveScript && (
              <button
                onClick={() => handleSaveBlock(codeText, language, blockId)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Save script"
              >
                {savedBlock === blockId ? <Check className="h-3 w-3 text-emerald-500" /> : <Save className="h-3 w-3" />}
                <span>{savedBlock === blockId ? 'Saved' : 'Save'}</span>
              </button>
            )}
            <button
              onClick={() => handleCopyBlock(codeText, blockId)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Copy code"
            >
              {copiedBlock === blockId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>{copiedBlock === blockId ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
        <pre className="overflow-auto p-3 font-mono text-[12.5px] leading-relaxed">{children}</pre>
      </div>
    )
  }

  const markdown = (content: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        pre: Pre,
        code: Code as React.ComponentType<{ className?: string; children?: ReactNode }>,
        p: ({ children }) => <p>{tintSpeech(children)}</p>,
        li: ({ children }) => <li>{tintSpeech(children)}</li>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
        a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{children}</a>,
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground" style={{ borderColor: 'var(--tint)' }}>
            {children}
          </blockquote>
        ),
        h1: ({ children }) => <h1 className="mt-3 mb-1 font-display text-[1.3em] font-semibold">{children}</h1>,
        h2: ({ children }) => <h2 className="mt-3 mb-1 font-display text-[1.15em] font-semibold">{children}</h2>,
        h3: ({ children }) => <h3 className="mt-2 mb-1 font-semibold">{children}</h3>,
        hr: () => <div className="my-3 border-t" />,
        table: ({ children }) => (
          <div className="my-2 w-full overflow-auto font-sans">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border-b px-2 py-1 text-left font-medium">{children}</th>,
        td: ({ children }) => <td className="border-b px-2 py-1 align-top">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  )

  const editor = (
    <div className="space-y-2 font-sans">
      <Textarea
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            commitEdit(isUser)
          } else if (e.key === 'Escape') {
            setIsEditing(false)
          }
        }}
        className="max-h-[50vh] min-h-[96px] bg-background text-sm"
        autoFocus
        aria-label="Edit message"
      />
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(false)}>Cancel</Button>
        <Button variant={isUser ? 'outline' : 'default'} size="sm" className="h-7 text-xs" onClick={() => commitEdit(false)}>Save</Button>
        {isUser && (
          <Button size="sm" className="h-7 text-xs" onClick={() => commitEdit(true)}>
            <RefreshCw className="h-3 w-3" /> Save &amp; resend
          </Button>
        )}
      </div>
    </div>
  )

  const body = (
    <>
      {thinkParts.map((part, idx) =>
        part.kind === 'md' ? (
          <div key={idx}>{markdown(part.content)}</div>
        ) : (
          <details key={idx} className="group/think mb-2 font-sans">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 py-0.5 text-xs text-muted-foreground transition-colors select-none hover:text-foreground">
              <ChevronRight className="h-3 w-3 transition-transform group-open/think:rotate-90" />
              {isStreaming && !hasVisibleText ? 'Thinking…' : 'Reasoning'}
            </summary>
            <pre className="mt-1 rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
              {part.content}
            </pre>
          </details>
        )
      )}
    </>
  )

  const waiting = isStreaming && !message.content
  const toolbar = !isStreaming && !isEditing && (
    <div
      className={cn(
        'absolute -top-3 z-10 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 opacity-0 shadow-sm transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100',
        isUser ? 'left-0' : 'right-0'
      )}
    >
      <ToolButton label={copied ? 'Copied' : 'Copy'} onClick={copyMessage}>
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </ToolButton>
      {onEditMessage && (
        <ToolButton label="Edit" onClick={startEditing}><Pencil className="h-3.5 w-3.5" /></ToolButton>
      )}
      {isUser && onResendMessage && (
        <ToolButton label="Resend from here (removes later messages)" onClick={() => onResendMessage(message.id)}>
          <RefreshCw className="h-3.5 w-3.5" />
        </ToolButton>
      )}
      {!isUser && isLast && onSwipe && (
        <ToolButton label="Write another version" onClick={() => onSwipe(message.id, 1)}>
          <RefreshCw className="h-3.5 w-3.5" />
        </ToolButton>
      )}
      {onBranchFromMessage && (
        <ToolButton label="Branch into a new chat from here" onClick={() => onBranchFromMessage(message.id)}>
          <GitFork className="h-3.5 w-3.5" />
        </ToolButton>
      )}
      {onDeleteMessage && (
        <ToolButton label={confirmDelete ? 'Click again to delete' : 'Delete'} onClick={handleDelete} danger>
          <Trash2 className={cn('h-3.5 w-3.5', confirmDelete && 'text-destructive')} />
        </ToolButton>
      )}
    </div>
  )

  if (isUser) {
    return (
      <div className="group/msg rise flex justify-end px-1 py-3" role="article" aria-label={`Message from ${sender} at ${time}`}>
        <div className={cn('relative min-w-0', isEditing ? 'w-full' : 'max-w-[82%]')}>
          {toolbar}
          {targetCharacter && (
            <div className="mb-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
              <CornerDownRight className="h-3 w-3" /> to {targetCharacter.name}
            </div>
          )}
          <div className="rounded-2xl rounded-br-md bg-accent/70 px-4 py-2.5">
            {isEditing ? editor : <div className="prose-chat" data-user="true">{body}</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="group/msg rise flex gap-4 px-1 py-3"
      style={character ? ({ '--char-hue': nameHue(character.name) } as React.CSSProperties) : undefined}
      role="article"
      aria-label={`Message from ${sender} at ${time}`}
    >
      <CharacterAvatar
        avatar={character?.avatar}
        name={sender}
        className="h-[3.75rem] w-12 rounded-xl text-lg shadow-sm"
      />

      <div className="relative min-w-0 flex-1">
        {toolbar}
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="font-display text-[1.0625rem] font-medium" style={{ color: 'var(--tint)' }}>{sender}</span>
          {!isStreaming && <span className="text-[11px] text-muted-foreground">{time}</span>}
        </div>

        {isEditing ? (
          editor
        ) : waiting ? (
          <div className="typing-dots flex h-7 items-center gap-1" role="status" aria-label={`${sender} is writing`}>
            <span /><span /><span />
          </div>
        ) : isStreaming && !hasVisibleText ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Brain className="h-3.5 w-3.5 animate-pulse" /> Thinking…
          </div>
        ) : (
          <div className={cn('prose-chat', isStreaming && 'streaming')}>{body}</div>
        )}

        {canSwipe && onSwipe && !isEditing && (
          <div className={cn(
            'mt-1 flex items-center gap-0.5 text-muted-foreground transition-opacity',
            swipeCount > 1 ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100'
          )}>
            <button
              type="button"
              onClick={() => onSwipe(message.id, -1)}
              disabled={swipeIndex === 0}
              aria-label="Previous version"
              className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-8 text-center text-[11px] tabular-nums">{swipeIndex + 1}/{swipeCount}</span>
            <button
              type="button"
              onClick={() => onSwipe(message.id, 1)}
              disabled={!isLast && swipeIndex === swipeCount - 1}
              aria-label={swipeIndex === swipeCount - 1 ? 'Write another version' : 'Next version'}
              title={swipeIndex === swipeCount - 1 ? 'Write another version' : undefined}
              className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}, (prev, next) =>
  prev.message.id === next.message.id &&
  prev.message.content === next.message.content &&
  prev.message.role === next.message.role &&
  prev.message.characterId === next.message.characterId &&
  prev.message.swipes === next.message.swipes &&
  prev.message.swipeIndex === next.message.swipeIndex &&
  prev.isStreaming === next.isStreaming &&
  prev.isLast === next.isLast &&
  prev.persona === next.persona &&
  prev.characters === next.characters &&
  prev.onSaveScript === next.onSaveScript &&
  prev.onEditMessage === next.onEditMessage &&
  prev.onResendMessage === next.onResendMessage &&
  prev.onBranchFromMessage === next.onBranchFromMessage &&
  prev.onDeleteMessage === next.onDeleteMessage &&
  prev.onSwipe === next.onSwipe
)
