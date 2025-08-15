import { Button } from './ui/button'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { User, Users, X } from 'lucide-react'
import type { Character } from '../types/ollama'

interface CharacterSelectorProps {
  characters: Character[]
  selectedCharacter?: Character
  onSelectCharacter: (character: Character | undefined) => void
  onManageCharacters: () => void
  disabled?: boolean
}

export function CharacterSelector({
  characters,
  selectedCharacter,
  onSelectCharacter,
  onManageCharacters,
  disabled = false
}: CharacterSelectorProps) {
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleValueChange = (value: string) => {
    if (value === 'none') {
      onSelectCharacter(undefined)
    } else if (value === 'manage') {
      onManageCharacters()
    } else {
      const character = characters.find(c => c.id === value)
      if (character) {
        onSelectCharacter(character)
      }
    }
  }

  const clearSelection = () => {
    onSelectCharacter(undefined)
  }

  return (
    <div className="flex items-center">
      {/* Compact Character Selector */}
      <Select
        value={selectedCharacter?.id || 'none'}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full sm:w-44 h-8 text-sm" aria-label="Select character">
          <SelectValue placeholder="Select character">
            {selectedCharacter ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-4 w-4">
                  {selectedCharacter.avatar ? (
                    <AvatarImage src={selectedCharacter.avatar} alt={selectedCharacter.name} />
                  ) : (
                    <AvatarFallback className="text-[10px]">
                      {getInitials(selectedCharacter.name)}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="truncate">{selectedCharacter.name}</span>
                {selectedCharacter.isDefault && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                    Default
                  </Badge>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>No character</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>No character</span>
            </div>
          </SelectItem>
          
          {characters.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Characters
              </div>
              {characters.map((character) => (
                <SelectItem key={character.id} value={character.id} className="text-sm">
                  <div className="flex items-center gap-2 w-full">
                    <Avatar className="h-5 w-5">
                      {character.avatar ? (
                        <AvatarImage src={character.avatar} alt={character.name} />
                      ) : (
                        <AvatarFallback className="text-xs">
                          {getInitials(character.name)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{character.name}</span>
                        {character.isDefault && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                            Default
                          </Badge>
                        )}
                      </div>
                      {character.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {character.description.length > 50 
                            ? `${character.description.substring(0, 50)}...`
                            : character.description
                          }
                        </div>
                      )}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </>
          )}
          
          <div className="border-t mt-1 pt-1">
            <SelectItem value="manage" className="text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>Manage Characters</span>
              </div>
            </SelectItem>
          </div>
        </SelectContent>
      </Select>

      {/* Clear button when character is selected */}
      {selectedCharacter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 ml-1 hover:bg-destructive/10"
          onClick={clearSelection}
          disabled={disabled}
          aria-label={`Clear ${selectedCharacter.name} character`}
          title="Clear character"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
} 