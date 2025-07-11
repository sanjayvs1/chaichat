import { Bot, User, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import type { ChatMessage } from '../types/ollama'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
  message: ChatMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  return (
    <div className={cn(
      "group flex w-full gap-3 px-4 py-2",
      isUser ? "justify-end" : "justify-start"
    )}>
      {!isUser && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-muted-foreground text-background">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
      
      <div className={cn(
        "flex flex-col space-y-1 max-w-[85%] md:max-w-[70%]",
        isUser ? "items-end" : "items-start"
      )}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </div>
        
        <Card className={cn(
          "relative",
          isUser 
            ? "bg-primary text-primary-foreground border-primary" 
            : "bg-muted border-muted"
        )}>
          <CardContent className="px-3 py-2">
            <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed m-0 p-0 bg-transparent">
                {message.content}
              </pre>
            </div>
            
            {/* Copy button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "absolute -bottom-1 -right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                isUser 
                  ? "hover:bg-primary-foreground/20 text-primary-foreground/70" 
                  : "hover:bg-muted-foreground/20 text-muted-foreground"
              )}
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span className="sr-only">Copy message</span>
            </Button>
          </CardContent>
        </Card>
      </div>
      
      {isUser && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  )
} 