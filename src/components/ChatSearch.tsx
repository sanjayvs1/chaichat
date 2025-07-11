import { useState, useEffect } from 'react'
import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Calendar, MessageSquare, User, Bot, Search, Filter } from 'lucide-react'
import type { ChatMessage } from '../types/ollama'

type SearchFilter = 'all' | 'user' | 'assistant' | 'today' | 'week' | 'month'

type Props = {
  search: (q: string) => Promise<Array<{ sessionId?: string; message: ChatMessage }>>
  loadSession: (sessionId: string) => void
}

export function ChatSearch({ search, loadSession }: Props) {
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [rawResults, setRawResults] = useState<Array<{ sessionId?: string; message: ChatMessage }>>([])
  const [isSearching, setIsSearching] = useState(false)
  
  // Handle async search with debouncing
  useEffect(() => {
    const searchAsync = async () => {
      if (!query.trim()) {
        setRawResults([])
        return
      }
      
      setIsSearching(true)
      try {
        const results = await search(query)
        setRawResults(results)
      } catch (error) {
        console.error('Search failed:', error)
        setRawResults([])
      } finally {
        setIsSearching(false)
      }
    }
    
    // Debounce search requests
    const timeoutId = setTimeout(searchAsync, 300)
    return () => clearTimeout(timeoutId)
  }, [query, search])
  
  // Apply filters to results
  const filteredResults = rawResults.filter(result => {
    const message = result.message
    const messageDate = new Date(message.timestamp)
    const now = new Date()
    
    switch (activeFilter) {
      case 'user':
        return message.role === 'user'
      case 'assistant':
        return message.role === 'assistant'
      case 'today':
        return messageDate.toDateString() === now.toDateString()
      case 'week': {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        return messageDate >= weekAgo
      }
      case 'month': {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        return messageDate >= monthAgo
      }
      default:
        return true
    }
  })

  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text
    
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-900 px-0.5 rounded">
          {part}
        </mark>
      ) : part
    )
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  const filterOptions: { key: SearchFilter; label: string; icon?: React.ComponentType<{ className?: string }> }[] = [
    { key: 'all', label: 'All' },
    { key: 'user', label: 'My messages', icon: User },
    { key: 'assistant', label: 'AI responses', icon: Bot },
    { key: 'today', label: 'Today', icon: Calendar },
    { key: 'week', label: 'This week', icon: Calendar },
    { key: 'month', label: 'This month', icon: Calendar },
  ]

  return (
    <div className="space-y-3 w-80 max-w-full">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search chats..."
          className="pl-10 pr-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Filter by:</p>
          <div className="flex flex-wrap gap-1">
            {filterOptions.map((option) => {
              const Icon = option.icon
              return (
                <Badge
                  key={option.key}
                  variant={activeFilter === option.key ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setActiveFilter(option.key)}
                >
                  {Icon && <Icon className="h-3 w-3 mr-1" />}
                  {option.label}
                </Badge>
              )
            })}
          </div>
        </div>
      )}

      {/* Results Count */}
      {query && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isSearching ? 'Searching...' : (
              <>
                {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} 
                {activeFilter !== 'all' && ` (${activeFilter})`}
              </>
            )}
          </span>
          {activeFilter !== 'all' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setActiveFilter('all')}
            >
              Clear filter
            </Button>
          )}
        </div>
      )}

      {/* Search Results */}
      {query && (
        <ScrollArea className="h-80 border rounded-md">
          {isSearching ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Searching...</p>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">No matches found</p>
              {activeFilter !== 'all' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Try removing filters or changing your search terms
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredResults.map((result, idx) => (
                <Button
                  key={idx}
                  variant="ghost"
                  className="w-full justify-start whitespace-normal h-auto p-3 text-left"
                  onClick={() => result.sessionId && loadSession(result.sessionId)}
                >
                  <div className="w-full space-y-2">
                    {/* Header with metadata */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        {result.message.role === 'user' ? (
                          <User className="h-3 w-3" />
                        ) : (
                          <Bot className="h-3 w-3" />
                        )}
                        <span className="capitalize">{result.message.role}</span>
                        {result.sessionId && (
                          <>
                            <span>•</span>
                            <MessageSquare className="h-3 w-3" />
                            <span>Past session</span>
                          </>
                        )}
                      </div>
                      <span>{formatDate(result.message.timestamp)}</span>
                    </div>
                    
                    {/* Message content with highlighting */}
                    <div className="text-sm">
                      {highlightText(
                        result.message.content.slice(0, 200) + 
                        (result.message.content.length > 200 ? '...' : ''),
                        query
                      )}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  )
} 