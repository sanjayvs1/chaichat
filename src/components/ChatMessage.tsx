import { User, Save, Copy, Check, CornerDownRight } from 'lucide-react'
import { memo, useMemo, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Character, ChatMessage as ChatMessageType } from '../types/ollama'
import { CharacterAvatar } from './CharacterAvatar'
import { Avatar, AvatarFallback } from './ui/avatar'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
  message: ChatMessageType
  characters: Character[]
  isStreaming?: boolean
  onSaveScript?: (code: string, language: string) => void
}

export const ChatMessage = memo(function ChatMessage({ message, characters, isStreaming = false, onSaveScript }: ChatMessageProps) {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null)
  const [savedBlock, setSavedBlock] = useState<string | null>(null)
  const isUser = message.role === 'user'
  
  // Find the character for this message
  const character = useMemo(() => {
    if (isUser || !message.characterId) return null
    return characters.find(c => c.id === message.characterId) || null
  }, [isUser, message.characterId, characters])

  // Who this user message was addressed to (multi-character chats)
  const targetCharacter = useMemo(() => {
    if (!isUser || !message.targetId) return null
    return characters.find(c => c.id === message.targetId) || null
  }, [isUser, message.targetId, characters])

  const formatTime = useMemo(() => {
    // Skip expensive formatting during streaming
    if (isStreaming) return 'streaming...';
    return message.timestamp.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }, [message.timestamp, isStreaming])

  const messageSender = useMemo(() => {
    return isUser ? 'You' : character?.name || 'Assistant'
  }, [isUser, character?.name])

  function splitThinkBlocks(text: string): Array<{ kind: 'md' | 'think'; content: string }> {
    const parts: Array<{ kind: 'md' | 'think'; content: string }> = []
    const regex = /<think>[\s\S]*?<\/think>/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const start = match.index
      const end = regex.lastIndex
      if (start > lastIndex) {
        parts.push({ kind: 'md', content: text.slice(lastIndex, start) })
      }
      const thinkInner = match[0].replace(/^<think>/, '').replace(/<\/think>$/, '')
      parts.push({ kind: 'think', content: thinkInner.trim() })
      lastIndex = end
    }
    if (lastIndex < text.length) {
      parts.push({ kind: 'md', content: text.slice(lastIndex) })
    }
    return parts
  }

  const extractTextContent = useCallback((node: unknown): string => {
    if (typeof node === 'string') return node
    if (typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(extractTextContent).join('')
    if (node && typeof node === 'object' && 'props' in node) {
      const props = (node as { props?: { children?: unknown } }).props
      if (props?.children !== undefined) return extractTextContent(props.children)
    }
    return ''
  }, [])

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

  let codeBlockIndex = 0

  const Code = ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
    if (inline) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-mono">
          {children}
        </code>
      )
    }
    return <code className={className || ''} data-language={className?.replace('language-', '')}>{children}</code>
  }

  const Pre = ({ children }: { children?: React.ReactNode }) => {
    // The rendered child of a <pre> is the <code> element; peek at its props for language info
    const codeChild = (Array.isArray(children) ? children[0] : children) as
      | { props?: { className?: string; 'data-language'?: string } }
      | undefined
    const language = codeChild?.props?.['data-language'] || codeChild?.props?.className?.replace('language-', '') || ''
    const codeText = extractTextContent(children)
    const blockId = `block-${codeBlockIndex++}`
    const isPython = /^(python|py|python3)$/i.test(language)

    return (
      <div className="my-2 overflow-hidden rounded-md border group/code">
        <div className="flex items-center justify-between bg-muted/60 px-3 py-1 border-b">
          <span className="text-[11px] text-muted-foreground font-mono">
            {language || 'code'}
          </span>
          <div className="flex items-center gap-1">
            {isPython && onSaveScript && (
              <button
                onClick={() => handleSaveBlock(codeText, language, blockId)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                title="Save script"
              >
                {savedBlock === blockId ? <Check className="h-3 w-3 text-emerald-500" /> : <Save className="h-3 w-3" />}
                <span>{savedBlock === blockId ? 'Saved' : 'Save'}</span>
              </button>
            )}
            <button
              onClick={() => handleCopyBlock(codeText, blockId)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
              title="Copy code"
            >
              {copiedBlock === blockId ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span>{copiedBlock === blockId ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
        <pre className="p-3 text-[12.5px] leading-relaxed overflow-auto font-mono">
          {children}
        </pre>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group px-4 py-2 mobile-chat-spacing",
        isUser ? "flex justify-end" : "flex justify-start"
      )}
      role="article"
      aria-label={`Message from ${messageSender} at ${formatTime}`}
    >
      <div className={cn(
        "flex gap-3 max-w-[85%]",
        isUser ? "flex-row-reverse" : "flex-row",
        isUser ? "items-end" : "items-start"
      )}>
        {/* Avatar */}
        <div className="flex-shrink-0">
          {isUser ? (
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-primary/80 text-primary-foreground text-xs">
                <User className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <CharacterAvatar
              avatar={character?.avatar}
              name={character?.name || 'Assistant'}
              className="h-6 w-6 text-[10px]"
            />
          )}
        </div>

        {/* Message content */}
        <div className={cn(
          "flex flex-col",
          isUser ? "items-end" : "items-start",
          isUser ? "max-w-[70%] chat-bubble-user" : "max-w-full chat-bubble-assistant"
        )}>
          {/* Character name label for assistant messages in character chats */}
          {!isUser && character && (
            <span className="text-[10px] font-medium text-muted-foreground mb-1 px-2">
              {character.name}
            </span>
          )}
          {/* Target indicator for user messages aimed at a specific character */}
          {isUser && targetCharacter && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1 px-2">
              <CornerDownRight className="h-3 w-3" />
              to {targetCharacter.name}
            </span>
          )}
          {/* Message bubble */}
          <div className={cn(
            "rounded-2xl px-4 py-3 shadow-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted/60 text-foreground border border-border/50 rounded-bl-md",
            isStreaming && "animate-pulse"
          )}>
            {isStreaming ? (
              // During streaming, render plain text for performance
              <div className="text-sm leading-relaxed">
                <pre className="whitespace-pre-wrap break-words font-sans">
                  {message.content}
                  <span className="inline-block w-1.5 h-3 bg-current/60 ml-1 animate-pulse" />
                </pre>
              </div>
            ) : (
              // When not streaming, use full markdown parsing
              splitThinkBlocks(message.content).map((part, idx) =>
                part.kind === 'md' ? (
                  <div key={idx} className="text-sm leading-relaxed text-[15px]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        pre: Pre,
                        code: Code as React.ComponentType<{ className?: string; children?: React.ReactNode }>,
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground mb-2">
                            {children}
                          </blockquote>
                        ),
                        h1: ({ children }) => <h1 className="mt-2 mb-1 text-base font-semibold">{children}</h1>,
                        h2: ({ children }) => <h2 className="mt-2 mb-1 text-sm font-semibold">{children}</h2>,
                        h3: ({ children }) => <h3 className="mt-2 mb-1 text-xs font-semibold">{children}</h3>,
                        table: ({ children }) => (
                          <div className="w-full overflow-auto mb-2">
                            <table className="w-full text-xs border-collapse">{children}</table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="border-b px-2 py-1 text-left font-medium text-xs">{children}</th>
                        ),
                        td: ({ children }) => <td className="border-b px-2 py-1 align-top text-xs">{children}</td>,
                      }}
                    >
                      {part.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <details key={idx} className="mt-2 border-t border-border/30">
                    <summary className="cursor-pointer select-none text-xs text-muted-foreground py-1">
                      Model reasoning
                    </summary>
                    <div className="pt-2">
                      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed bg-background/50 rounded p-2">
                        {part.content}
                      </pre>
                    </div>
                  </details>
                )
              )
            )}
          </div>

          {/* Timestamp - minimal and positioned appropriately */}
          {!isStreaming && (
            <span className={cn(
              "text-[10px] text-muted-foreground mt-1 px-2",
              isUser ? "text-right" : "text-left"
            )}>
              {formatTime}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.message.role !== nextProps.message.role) return false;
  if (prevProps.message.characterId !== nextProps.message.characterId) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  if (prevProps.characters.length !== nextProps.characters.length) return false;
  if (prevProps.onSaveScript !== nextProps.onSaveScript) return false;
  return true;
})