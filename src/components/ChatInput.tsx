import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSendMessage, disabled, placeholder = "Message..." }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim())
      setMessage('')
      // Reset textarea height after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey || e.ctrlKey) {
        // Allow new line with Shift+Enter or Ctrl+Enter
        return
      } else {
        // Send message with Enter
        e.preventDefault()
        handleSubmit()
      }
    }
  }

  // Auto-resize textarea with smoother transitions
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      // Reset height to get accurate scrollHeight
      textarea.style.height = 'auto'
      
      // Calculate new height
      const scrollHeight = textarea.scrollHeight
      const minHeight = 36 // Reduced from 40px
      const maxHeight = 160 // Reduced from 200px for more compact design
      
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight)
      textarea.style.height = newHeight + 'px'
      
      // Show scrollbar only when at max height
      textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden'
    }
  }, [message])

  // Focus management for accessibility
  const handleFocus = () => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const canSend = message.trim().length > 0 && !disabled && message.length <= 4000
  const isNearLimit = message.length > 3000
  const isOverLimit = message.length > 4000

  return (
    <div className="relative">
      <div 
        className="flex items-end gap-3 p-4 bg-background border border-border rounded-xl shadow-sm focus-within:shadow-md focus-within:border-ring transition-all duration-200"
        onClick={handleFocus}
        role="group"
        aria-label="Message input"
      >
        <div className="flex-1 min-w-0">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={disabled ? "Please wait..." : placeholder}
            disabled={disabled}
            autoFocus
            aria-label="Type your message"
            aria-describedby="chat-input-help"
            id="chat-input"
            className="min-h-[36px] max-h-[160px] resize-none border-0 bg-transparent p-2 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
            style={{ 
              lineHeight: '1.4',
              overflowY: 'hidden' // Will be set by useEffect
            }}
          />
        </div>
        
        <Button
          onClick={handleSubmit}
          disabled={!canSend || isOverLimit}
          size="sm"
          className="h-9 w-9 shrink-0 rounded-lg transition-all duration-200"
          variant={canSend ? "default" : "ghost"}
          aria-label={disabled ? "Please wait" : canSend ? "Send message" : "Enter a message to send"}
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      
      {/* Accessible help text and character count */}
      <div 
        id="chat-input-help" 
        className="flex justify-between items-center mt-2 px-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">
            <kbd className="inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-[10px]">
              ↵
            </kbd>
            {' '}send · {' '}
            <kbd className="inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-[10px]">
              ⇧↵
            </kbd>
            {' '}line
          </span>
          
          {disabled && (
            <span className="text-orange-500 flex items-center gap-1" role="status" aria-live="polite">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating...
            </span>
          )}
        </div>
        
        {(message.length > 0 || isNearLimit) && (
          <div className="flex items-center gap-2">
            <span 
              className={
                isOverLimit 
                  ? 'text-destructive font-medium' 
                  : isNearLimit 
                    ? 'text-orange-500' 
                    : ''
              }
              role={isOverLimit ? "alert" : undefined}
              aria-live={isNearLimit ? "polite" : undefined}
            >
              {message.length}/4000
            </span>
            {isOverLimit && (
              <span className="text-destructive text-xs" role="alert">
                Too long
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 