import { useState, useRef, useEffect, memo } from 'react'
import { ArrowUp, FastForward, MoreHorizontal, PenLine, RefreshCw, Square, StickyNote, UserRound } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  onStop?: () => void
  onContinue?: () => void
  onRegenerate?: () => void
  onImpersonate?: () => void
  onOpenNote?: () => void
  onSwipeLast?: (direction: -1 | 1) => void
  disabled?: boolean
  /** True only while a response is actively streaming */
  generating?: boolean
  placeholder?: string
  /** An empty send asks for a reply without saying anything */
  canNudge?: boolean
  /** The last message is the assistant's, so it can be extended or rewritten */
  canRewrite?: boolean
  /** Draft written by impersonate */
  draft?: { text: string } | null
  onDraftTaken?: () => void
}

const MAX_HEIGHT = 200

export const ChatInput = memo(function ChatInput({
  onSendMessage,
  onStop,
  onContinue,
  onRegenerate,
  onImpersonate,
  onOpenNote,
  onSwipeLast,
  disabled,
  generating = false,
  placeholder = 'Message...',
  canNudge = false,
  canRewrite = false,
  draft,
  onDraftTaken,
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (draft) setMessage(draft.text)
  }, [draft])

  // Hand the box back once the draft stopped streaming, so typing isn't overwritten
  useEffect(() => {
    if (draft && !generating) {
      onDraftTaken?.()
      textareaRef.current?.focus()
    }
  }, [draft, generating, onDraftTaken])

  // Ready to type as soon as a reply finishes
  useEffect(() => {
    if (!disabled) textareaRef.current?.focus()
  }, [disabled])

  const handleSubmit = () => {
    if (disabled) return
    const text = message.trim()
    if (!text && !canNudge) return
    onSendMessage(text)
    setMessage('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault()
      handleSubmit()
    } else if (!message && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && onSwipeLast) {
      e.preventDefault()
      onSwipeLast(e.key === 'ArrowLeft' ? -1 : 1)
    }
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    textarea.style.height = `${Math.min(scrollHeight, MAX_HEIGHT)}px`
    textarea.style.overflowY = scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [message])

  const canSend = !disabled && (message.trim().length > 0 || canNudge)

  return (
    <div
      className="flex items-end gap-1.5 rounded-2xl border bg-card/90 p-2 shadow-[0_8px_30px_-16px_oklch(0_0_0/0.5)] backdrop-blur transition-[border-color,box-shadow] focus-within:border-primary/50 focus-within:shadow-[0_8px_30px_-14px_var(--primary)]"
      role="group"
      aria-label="Message input"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuItem disabled={disabled || !canRewrite} onClick={onContinue}>
            <FastForward className="mr-2 h-4 w-4" /> Continue last reply
          </DropdownMenuItem>
          <DropdownMenuItem disabled={disabled || !canRewrite} onClick={onRegenerate}>
            <RefreshCw className="mr-2 h-4 w-4" /> Write another version
          </DropdownMenuItem>
          <DropdownMenuItem disabled={disabled} onClick={onImpersonate}>
            <UserRound className="mr-2 h-4 w-4" /> Write my reply for me
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenNote}>
            <StickyNote className="mr-2 h-4 w-4" /> Author's note
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus
        aria-label="Type your message"
        id="chat-input"
        rows={1}
        className="min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-snug shadow-none focus-visible:ring-0 focus-visible:outline-none dark:bg-transparent"
      />

      {generating && onStop ? (
        <Button
          onClick={onStop}
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl"
          variant="secondary"
          aria-label="Stop generating"
          title="Stop generating"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </Button>
      ) : (
        <Button
          onClick={handleSubmit}
          disabled={!canSend}
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl"
          aria-label={message.trim() ? 'Send message' : 'Ask for a reply'}
          title={message.trim() ? 'Send' : canNudge ? 'Let them keep talking' : 'Send'}
        >
          {message.trim() || !canNudge ? <ArrowUp className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
        </Button>
      )}
    </div>
  )
})
