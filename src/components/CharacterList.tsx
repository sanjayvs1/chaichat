import { useState, useEffect, useMemo } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { CharacterCard } from './CharacterCard'
import { CharacterEditor } from './CharacterEditor'
import { Plus, Search, Users, AlertCircle, SortAsc } from 'lucide-react'
import { Alert, AlertDescription } from './ui/alert'
import type { Character } from '../types/ollama'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'

interface CharacterListProps {
  characters: Character[]
  selectedCharacter?: Character
  onSelectCharacter: (character: Character) => void
  onCreateCharacter: (character: Character) => void
  onUpdateCharacter: (characterId: string, updates: Partial<Character>) => void
  onDeleteCharacter: (characterId: string) => void
  onDuplicateCharacter: (character: Character) => void
  isLoading?: boolean
  error?: string | null
  onClose?: () => void
}

export function CharacterList({
  characters,
  selectedCharacter,
  onSelectCharacter,
  onCreateCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onDuplicateCharacter,
  isLoading = false,
  error = null,
  onClose
}: CharacterListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<Character | undefined>()
  const [filteredCharacters, setFilteredCharacters] = useState<Character[]>([])
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date')

  // Filter characters based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCharacters(characters)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = characters.filter(char =>
        char.name.toLowerCase().includes(query) ||
        char.description.toLowerCase().includes(query)
      )
      setFilteredCharacters(filtered)
    }
  }, [characters, searchQuery])

  // Sort characters
  const displayedCharacters = useMemo(() => {
    const list = [...filteredCharacters]
    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      // date: newest first
      list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    }
    return list
  }, [filteredCharacters, sortBy])

  const handleCreateNew = () => {
    setEditingCharacter(undefined)
    setShowEditor(true)
  }

  const handleEdit = (character: Character) => {
    setEditingCharacter(character)
    setShowEditor(true)
  }

  const handleSave = (character: Character) => {
    if (editingCharacter) {
      onUpdateCharacter(character.id, character)
    } else {
      onCreateCharacter(character)
    }
    setShowEditor(false)
    setEditingCharacter(undefined)
  }

  const handleCancel = () => {
    setShowEditor(false)
    setEditingCharacter(undefined)
  }

  const handleDuplicate = (character: Character) => {
    const duplicatedCharacter: Character = {
      ...character,
      id: crypto.randomUUID(),
      name: `${character.name} (Copy)`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    onDuplicateCharacter(duplicatedCharacter)
  }

  if (showEditor) {
    return (
      <CharacterEditor
        character={editingCharacter}
        onSave={handleSave}
        onCancel={handleCancel}
        isLoading={isLoading}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pr-12">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Characters</h2>
          <span className="text-sm text-muted-foreground">
            ({displayedCharacters.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8">
                <SortAsc className="h-4 w-4 mr-2" />
                {sortBy === 'date' ? 'By Date' : 'By Name'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onClick={() => setSortBy('date')}>By Date</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('name')}>By Name</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleCreateNew} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search characters..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Character List */}
      <ScrollArea className="flex-1">
        {isLoading && characters.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading characters...</p>
            </div>
          </div>
        ) : filteredCharacters.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No characters found matching your search' : 'No characters yet'}
              </p>
              {!searchQuery && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCreateNew}
                  className="mt-2"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first character
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                isSelected={selectedCharacter?.id === character.id}
                onSelect={(c) => { onSelectCharacter(c); onClose?.() }}
                onEdit={handleEdit}
                onDelete={onDeleteCharacter}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
} 