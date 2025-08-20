import { Bot, User } from 'lucide-react'
import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Character, ChatMessage as ChatMessageType } from '../types/ollama'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
// import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
  message: ChatMessageType
  characters: Character[]
  isStreaming?: boolean
}

export const ChatMessage = memo(function ChatMessage({ message, characters, isStreaming = false }: ChatMessageProps) {
  // const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  
  // Find the character for this message
  const character = useMemo(() => {
    if (isUser || !message.characterId) return null
    return characters.find(c => c.id === message.characterId) || null
  }, [isUser, message.characterId, characters])
  
  // const handleCopy = async () => {
  //   try {
  //     await navigator.clipboard.writeText(message.content)
  //     setCopied(true)
  //     setTimeout(() => setCopied(false), 2000)
  //   } catch (error) {
  //     console.error('Failed to copy text:', error)
  //   }
  // }

  const getCharacterInitials = useMemo(() => {
    if (!character?.name) return ''
    return character.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  }, [character?.name])

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

  const Code = ({ inline, className, children }: { inline?: boolean; className?: string; children: any }) => {
    // Inline code is enclosed in backticks in markdown
    if (inline) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-mono">
          {children}
        </code>
      )
    }
    // For fenced code blocks we just render the raw text inside a <code> element.
    // The surrounding <pre> element will be provided by the Pre component below.
    return <code className={className || ''}>{children}</code>
  }

  // Dedicated renderer for fenced code blocks to avoid nested <pre>/<div> inside <p> warnings
  const Pre = ({ className, children }: { className?: string; children: any }) => {
    return (
      <div className="my-2 overflow-hidden rounded-md border">
        <pre className={`p-3 text-[12.5px] leading-relaxed overflow-auto font-mono ${className || ''}`}>
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
          <Avatar className="h-6 w-6">
            {isUser ? (
              <AvatarFallback className="bg-primary/80 text-primary-foreground text-xs">
                <User className="h-3 w-3" />
              </AvatarFallback>
            ) : character?.avatar ? (
              <AvatarImage src={character.avatar} alt={character?.name || 'Assistant'} />
            ) : (
              <AvatarFallback className="bg-muted-foreground/80 text-background text-xs">
                {character ? getCharacterInitials : <Bot className="h-3 w-3" />}
              </AvatarFallback>
            )}
          </Avatar>
        </div>

        {/* Message content */}
        <div className={cn(
          "flex flex-col",
          isUser ? "items-end" : "items-start",
          isUser ? "max-w-[70%] chat-bubble-user" : "max-w-full chat-bubble-assistant"
        )}>
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
                        pre: Pre as any,
                        code: Code as any,
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
  // Rerender only when the message object identity or key fields change
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.message.role !== nextProps.message.role) return false;
  if (prevProps.message.characterId !== nextProps.message.characterId) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;
  // Treat characters as stable by length-only to avoid deep compares
  if (prevProps.characters.length !== nextProps.characters.length) return false;
  return true;
})