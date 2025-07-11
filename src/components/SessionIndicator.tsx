import { MessageSquare, Clock, Users, Save } from 'lucide-react'
import type { ChatSession } from '../types/ollama'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

interface SessionIndicatorProps {
  currentSession?: ChatSession | null
  messageCount: number
  onSaveAsSession?: () => void
  className?: string
}

export function SessionIndicator({ 
  currentSession, 
  messageCount, 
  onSaveAsSession,
  className 
}: SessionIndicatorProps) {
  if (messageCount === 0) return null

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }

  return (
    <div className={`flex items-center justify-between px-4 py-2 bg-muted/30 border-b ${className}`}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {currentSession ? (
            <>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {currentSession.title}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(currentSession.createdAt)}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">New Conversation</p>
                <p className="text-xs text-muted-foreground">Unsaved chat</p>
              </div>
            </>
          )}
        </div>
        
        <Badge variant="secondary" className="text-xs">
          {messageCount} message{messageCount !== 1 ? 's' : ''}
        </Badge>
      </div>

      {!currentSession && messageCount > 0 && onSaveAsSession && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveAsSession}
          className="h-7 text-xs"
        >
          <Save className="h-3 w-3 mr-1" />
          Save Chat
        </Button>
      )}
    </div>
  )
} 