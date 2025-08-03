import { Bot, User } from 'lucide-react'
import { memo, useMemo } from 'react'
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

  return (
    <div 
      className={cn(
        "group flex w-full gap-2 px-1 py-1.5 hover:bg-muted/30 transition-colors",
        isUser ? "justify-end" : "justify-start"
      )}
      role="article"
      aria-label={`Message from ${messageSender} at ${formatTime}`}
    >
      {!isUser && (
        <Avatar className="h-7 w-7 shrink-0 mt-1">
          {character?.avatar ? (
            <AvatarImage src={character.avatar} alt={character.name} />
          ) : (
            <AvatarFallback className="bg-muted-foreground text-background text-xs">
              {character ? getCharacterInitials : <Bot className="h-3 w-3" />}
            </AvatarFallback>
          )}
        </Avatar>
      )}
      
      <div className={cn(
        "flex flex-col space-y-1 min-w-0",
        isUser ? "items-end" : "items-start"
      )}>
        {/* Message header - more compact */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs font-medium text-muted-foreground">
            {messageSender}
          </span>
          {/* Remove duplicate character name badge */}
          <span className="text-xs text-muted-foreground/70">
            {formatTime}
          </span>
        </div>
        
        {/* Message content */}
        <div className={cn(
          "relative group/message rounded-lg border p-3",
          isUser 
            ? "bg-primary text-primary-foreground border-primary/20 max-w-[85%] md:max-w-[75%]" 
            : "bg-muted/50 border-muted max-w-[95%] md:max-w-[95%]"
        )}>
          <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed m-0 p-0 bg-transparent">
              {message.content}
            </pre>
          </div>
          
          {/* Copy button */}
          {/* <Button
            variant="ghost"
            size="sm"
            className={cn(
              "absolute -top-1 -right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
              isUser 
                ? "hover:bg-primary-foreground/20 text-primary-foreground/70 hover:text-primary-foreground" 
                : "hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
            )}
            onClick={handleCopy}
            aria-label={`Copy ${messageSender}'s message`}
            title={copied ? "Copied!" : "Copy message"}
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button> */}
        </div>
      </div>
      
      {isUser && (
        <Avatar className="h-7 w-7 shrink-0 mt-1">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            <User className="h-3 w-3" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison function to optimize rerenders
  // Only rerender if message content, role, characterId, or characters array changes
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.role === nextProps.message.role &&
    prevProps.message.characterId === nextProps.message.characterId &&
    prevProps.characters.length === nextProps.characters.length &&
    prevProps.characters.every((char, index) => 
      char.id === nextProps.characters[index]?.id &&
      char.name === nextProps.characters[index]?.name &&
      char.avatar === nextProps.characters[index]?.avatar
    )
  )
}) 