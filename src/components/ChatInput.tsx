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
      const minHeight = 40 // min-h-[40px]
      const maxHeight = 200 // Increased max height for better usability
      
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
        className="flex items-end gap-4 p-6 bg-background border border-border rounded-2xl shadow-sm focus-within:shadow-md focus-within:border-ring transition-all duration-200"
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
              className="min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent p-2 text-base focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
              style={{ 
                lineHeight: '1.5',
                overflowY: 'hidden' // Will be set by useEffect
              }}
            />
        </div>
        
        <Button
          onClick={handleSubmit}
          disabled={!canSend || isOverLimit}
          size="icon"
          className="h-10 w-10 shrink-0 rounded-lg transition-all duration-200"
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
          <span>
            <kbd className="inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-xs">
              ↵
            </kbd>
            {' '}send · {' '}
            <kbd className="inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-xs">
              ⇧↵
            </kbd>
            {' '}or {' '}
            <kbd className="inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-xs">
              ⌃↵
            </kbd>
            {' '}new line
          </span>
          
          {disabled && (
            <span className="text-orange-500" role="status" aria-live="polite">
              Generating response...
            </span>
          )}
        </div>
        
        {message.length > 0 && (
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
                Message too long
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 