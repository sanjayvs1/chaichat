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
}

export const ChatMessage = memo(function ChatMessage({ message, characters }: ChatMessageProps) {
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
    return message.timestamp.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }, [message.timestamp])

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
        "group grid grid-cols-[auto,1fr] gap-3 px-3 py-2 hover:bg-muted/20 transition-colors"
      )}
      role="article"
      aria-label={`Message from ${messageSender} at ${formatTime}`}
    >
      <div className="pt-0.5">
        <Avatar className="h-8 w-8">
          {isUser ? (
            <AvatarFallback className="bg-primary/80 text-primary-foreground text-xs">
              <User className="h-3.5 w-3.5" />
            </AvatarFallback>
          ) : character?.avatar ? (
            <AvatarImage src={character.avatar} alt={character?.name || 'Assistant'} />
          ) : (
            <AvatarFallback className="bg-muted-foreground/80 text-background text-xs">
              {character ? getCharacterInitials : <Bot className="h-3.5 w-3.5" />}
            </AvatarFallback>
          )}
        </Avatar>
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-2 leading-none">
          <span className="text-sm font-medium">
            {messageSender}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatTime}
          </span>
        </div>

        <div className="mt-1 rounded-md bg-muted/30 border border-muted p-0 max-w-[95%]">
          {splitThinkBlocks(message.content).map((part, idx) =>
            part.kind === 'md' ? (
              <div key={idx} className="px-3 py-2">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: Pre as any,
                    code: Code as any,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-muted-foreground/40 pl-3 italic text-muted-foreground mb-2">
                        {children}
                      </blockquote>
                    ),
                    h1: ({ children }) => <h1 className="mt-2 mb-1 text-lg font-semibold">{children}</h1>,
                    h2: ({ children }) => <h2 className="mt-2 mb-1 text-base font-semibold">{children}</h2>,
                    h3: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold">{children}</h3>,
                    table: ({ children }) => (
                      <div className="w-full overflow-auto mb-2">
                        <table className="w-full text-sm border-collapse">{children}</table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="border-b px-2 py-1 text-left font-medium">{children}</th>
                    ),
                    td: ({ children }) => <td className="border-b px-2 py-1 align-top">{children}</td>,
                  }}
                >
                  {part.content}
                </ReactMarkdown>
              </div>
            ) : (
              <details key={idx} className="border-t border-muted/80">
                <summary className="px-3 py-2 cursor-pointer select-none text-xs text-muted-foreground">
                  Model reasoning
                </summary>
                <div className="px-3 pb-3">
                  <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed bg-muted/40 rounded p-2">
                    {part.content}
                  </pre>
                </div>
              </details>
            )
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
  // Treat characters as stable by length-only to avoid deep compares
  if (prevProps.characters.length !== nextProps.characters.length) return false;
  return true;
})